//! gRPC helpers mirroring Ika `chains/solana/examples/_shared/ika-setup.ts`:
//! mock `SubmitTransaction` DKG, `PresignForDWallet`, and `Sign` with `ApprovalProof::Solana`.

use anyhow::{anyhow, Context};
use ika_dwallet_types::{
    ApprovalProof, ChainId, DWalletCurve, DWalletRequest, DWalletSignatureAlgorithm,
    NetworkSignedAttestation, SignedRequestData, TransactionResponseData, UserSecretKeyShare,
    UserSignature, VersionedDWalletDataAttestation, VersionedPresignDataAttestation,
};
use ika_grpc::d_wallet_service_client::DWalletServiceClient;
use ika_grpc::UserSignedRequest;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use tonic::transport::Channel;

const EPOCH: u64 = 1;

/// Matches `examples/_shared/ika-setup.ts` — mock accepts placeholder shares.
fn mock_dkg_request(curve: DWalletCurve, payer: &Keypair) -> DWalletRequest {
    DWalletRequest::DKG {
        dwallet_network_encryption_public_key: vec![0u8; 32],
        curve,
        centralized_public_key_share_and_proof: vec![0u8; 32],
        user_secret_key_share: UserSecretKeyShare::Encrypted {
            encrypted_centralized_secret_share_and_proof: vec![0u8; 32],
            encryption_key: vec![0u8; 32],
            signer_public_key: payer.pubkey().to_bytes().to_vec(),
        },
        user_public_output: vec![0u8; 32],
        sign_during_dkg_request: None,
    }
}

fn mock_network_attestation() -> NetworkSignedAttestation {
    NetworkSignedAttestation {
        attestation_data: vec![0u8; 32],
        network_signature: vec![0u8; 64],
        network_pubkey: vec![0u8; 32],
        epoch: EPOCH,
    }
}

/// Mock user auth: Ed25519 signature bytes are zeros (pre-alpha mock).
fn mock_user_signature(payer: &Keypair) -> anyhow::Result<Vec<u8>> {
    let sig = UserSignature::Ed25519 {
        signature: vec![0u8; 64],
        public_key: payer.pubkey().to_bytes().to_vec(),
    };
    bcs::to_bytes(&sig).map_err(Into::into)
}

fn signed_request_dkg(payer: &Keypair, curve: DWalletCurve) -> anyhow::Result<Vec<u8>> {
    let data = SignedRequestData {
        session_identifier_preimage: [0u8; 32],
        epoch: EPOCH,
        chain_id: ChainId::Solana,
        intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
        request: mock_dkg_request(curve, payer),
    };
    bcs::to_bytes(&data).map_err(Into::into)
}

/// Build PDA seeds for a dWallet account: `["dwallet", chunks_of(curve_u16_le ‖ public_key)]`.
/// Matches Ika docs + `chains/solana/examples/_shared/ika-setup.ts` (`dwalletPdaSeeds`).
pub fn dwallet_pda_seeds(curve: DWalletCurve, public_key: &[u8]) -> Vec<Vec<u8>> {
    let disc = curve as u16;
    let mut payload = Vec::with_capacity(2 + public_key.len());
    payload.extend_from_slice(&disc.to_le_bytes());
    payload.extend_from_slice(public_key);
    let mut seeds: Vec<Vec<u8>> = vec![b"dwallet".to_vec()];
    for chunk in payload.chunks(32) {
        seeds.push(chunk.to_vec());
    }
    seeds
}

pub fn find_dwallet_pda(curve: DWalletCurve, public_key: &[u8], dwallet_program: &Pubkey) -> (Pubkey, u8) {
    let seed_vecs = dwallet_pda_seeds(curve, public_key);
    let seeds: Vec<&[u8]> = seed_vecs.iter().map(|v| v.as_slice()).collect();
    Pubkey::find_program_address(&seeds, dwallet_program)
}

/// MessageApproval PDA: dwallet chunks ‖ `message_approval` ‖ scheme u16 LE ‖ message_digest.
/// Omit `message_metadata_digest` when zero (our PRISM path uses zero metadata).
pub fn find_message_approval_pda(
    curve: DWalletCurve,
    dwallet_public_key: &[u8],
    signature_scheme_u16: u16,
    message_digest: &[u8; 32],
    dwallet_program: &Pubkey,
) -> (Pubkey, u8) {
    let mut seed_vecs = dwallet_pda_seeds(curve, dwallet_public_key);
    seed_vecs.push(b"message_approval".to_vec());
    seed_vecs.push(signature_scheme_u16.to_le_bytes().to_vec());
    seed_vecs.push(message_digest.to_vec());
    let seeds: Vec<&[u8]> = seed_vecs.iter().map(|v| v.as_slice()).collect();
    Pubkey::find_program_address(&seeds, dwallet_program)
}

/// Parse on-chain Ika **DWallet** account (discriminator 2). Returns `(DWalletCurve, public_key bytes)`.
pub fn parse_ika_dwallet_account(data: &[u8]) -> anyhow::Result<(DWalletCurve, Vec<u8>)> {
    if data.len() < 39 {
        anyhow::bail!("dWallet account data too short");
    }
    if data[0] != 2 {
        anyhow::bail!("expected DWallet discriminator 2, got {}", data[0]);
    }
    let curve_raw = u16::from_le_bytes([data[34], data[35]]);
    let curve = match curve_raw {
        0 => DWalletCurve::Secp256k1,
        1 => DWalletCurve::Secp256r1,
        2 => DWalletCurve::Curve25519,
        3 => DWalletCurve::Ristretto,
        _ => anyhow::bail!("unknown dWallet curve id {curve_raw}"),
    };
    let pk_len = data[37] as usize;
    if 38 + pk_len > data.len() {
        anyhow::bail!("invalid public_key_len {pk_len}");
    }
    Ok((curve, data[38..38 + pk_len].to_vec()))
}

pub struct DkgResult {
    pub dwallet_pda: Pubkey,
    /// First 32 bytes of attestation — session id for presign/sign.
    pub dwallet_id: [u8; 32],
    pub public_key: Vec<u8>,
}

/// Parse `TransactionResponseData::Attestation` (`VersionedDWalletDataAttestation`).
pub fn parse_dkg_attestation(response_bytes: &[u8]) -> anyhow::Result<DkgResult> {
    let decoded: TransactionResponseData = bcs::from_bytes(response_bytes)?;
    match decoded {
        TransactionResponseData::Attestation(att) => {
            let v: VersionedDWalletDataAttestation = bcs::from_bytes(&att.attestation_data)?;
            match v {
                VersionedDWalletDataAttestation::V1(v1) => Ok(DkgResult {
                    dwallet_pda: Pubkey::default(),
                    dwallet_id: v1.session_identifier,
                    public_key: v1.public_key,
                }),
            }
        }
        TransactionResponseData::Error { message } => Err(anyhow!("DKG error: {message}")),
        _ => Err(anyhow!("expected Attestation response from DKG")),
    }
}

/// After parsing attestation, compute on-chain dWallet PDA from curve + pubkey.
pub fn finish_dkg_result(
    mut r: DkgResult,
    curve: DWalletCurve,
    dwallet_program: &Pubkey,
) -> anyhow::Result<DkgResult> {
    let (pda, _) = find_dwallet_pda(curve, &r.public_key, dwallet_program);
    r.dwallet_pda = pda;
    Ok(r)
}

pub async fn connect_grpc(endpoint: &str) -> anyhow::Result<DWalletServiceClient<Channel>> {
    DWalletServiceClient::connect(endpoint.to_string())
        .await
        .with_context(|| format!("connect gRPC {endpoint}"))
}

pub async fn submit_dkg(
    client: &mut DWalletServiceClient<Channel>,
    payer: &Keypair,
    curve: DWalletCurve,
) -> anyhow::Result<Vec<u8>> {
    let req = UserSignedRequest {
        user_signature: mock_user_signature(payer)?,
        signed_request_data: signed_request_dkg(payer, curve)?,
    };
    let resp = client
        .submit_transaction(req)
        .await
        .map_err(|e| anyhow!("submit_transaction: {e}"))?
        .into_inner();
    Ok(resp.response_data)
}

fn presign_request(
    payer: &Keypair,
    session_preimage: [u8; 32],
    dwallet_public_key: Vec<u8>,
    curve: DWalletCurve,
    sig_alg: DWalletSignatureAlgorithm,
) -> anyhow::Result<Vec<u8>> {
    let data = SignedRequestData {
        session_identifier_preimage: session_preimage,
        epoch: EPOCH,
        chain_id: ChainId::Solana,
        intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
        request: DWalletRequest::PresignForDWallet {
            dwallet_network_encryption_public_key: vec![0u8; 32],
            dwallet_public_key,
            dwallet_attestation: mock_network_attestation(),
            curve,
            signature_algorithm: sig_alg,
        },
    };
    bcs::to_bytes(&data).map_err(Into::into)
}

pub async fn request_presign(
    client: &mut DWalletServiceClient<Channel>,
    payer: &Keypair,
    session_preimage: [u8; 32],
    dwallet_public_key: Vec<u8>,
    curve: DWalletCurve,
    sig_alg: DWalletSignatureAlgorithm,
) -> anyhow::Result<Vec<u8>> {
    let req = UserSignedRequest {
        user_signature: mock_user_signature(payer)?,
        signed_request_data: presign_request(payer, session_preimage, dwallet_public_key, curve, sig_alg)?,
    };
    let resp = client
        .submit_transaction(req)
        .await
        .map_err(|e| anyhow!("presign submit_transaction: {e}"))?
        .into_inner();
    let decoded: TransactionResponseData = bcs::from_bytes(&resp.response_data)?;
    match decoded {
        TransactionResponseData::Attestation(att) => {
            let v: VersionedPresignDataAttestation = bcs::from_bytes(&att.attestation_data)?;
            match v {
                VersionedPresignDataAttestation::V1(v1) => Ok(v1.presign_session_identifier),
            }
        }
        TransactionResponseData::Error { message } => Err(anyhow!("presign: {message}")),
        _ => Err(anyhow!("unexpected presign response")),
    }
}

fn sign_request(
    payer: &Keypair,
    session_preimage: [u8; 32],
    message: &[u8],
    presign_id: &[u8],
    approval_tx_sig: &[u8],
    slot: u64,
) -> anyhow::Result<Vec<u8>> {
    let data = SignedRequestData {
        session_identifier_preimage: session_preimage,
        epoch: EPOCH,
        chain_id: ChainId::Solana,
        intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
        request: DWalletRequest::Sign {
            message: message.to_vec(),
            message_metadata: Vec::new(),
            presign_session_identifier: presign_id.to_vec(),
            message_centralized_signature: vec![0u8; 64],
            dwallet_attestation: mock_network_attestation(),
            approval_proof: ApprovalProof::Solana {
                transaction_signature: approval_tx_sig.to_vec(),
                slot,
            },
        },
    };
    bcs::to_bytes(&data).map_err(Into::into)
}

pub async fn request_sign(
    client: &mut DWalletServiceClient<Channel>,
    payer: &Keypair,
    session_preimage: [u8; 32],
    message: &[u8],
    presign_id: &[u8],
    approval_tx_sig: &[u8],
    slot: u64,
) -> anyhow::Result<Vec<u8>> {
    let req = UserSignedRequest {
        user_signature: mock_user_signature(payer)?,
        signed_request_data: sign_request(
            payer,
            session_preimage,
            message,
            presign_id,
            approval_tx_sig,
            slot,
        )?,
    };
    let resp = client
        .submit_transaction(req)
        .await
        .map_err(|e| anyhow!("sign submit_transaction: {e}"))?
        .into_inner();
    let decoded: TransactionResponseData = bcs::from_bytes(&resp.response_data)?;
    match decoded {
        TransactionResponseData::Signature { signature } => Ok(signature),
        TransactionResponseData::Error { message } => Err(anyhow!("sign: {message}")),
        _ => Err(anyhow!("unexpected sign response")),
    }
}

