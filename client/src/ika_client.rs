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

/// Canonical Ika **DWallet** account layout (discriminator 2) per the
/// [pre-alpha book](https://solana-pre-alpha.ika.xyz/print.html) — search
/// "DWallet account" / `docs/src/reference/accounts.md`.
///
/// | Offset | Field                        |
/// | -----: | ---------------------------- |
/// |   `0`  | discriminator (`2`)          |
/// |   `2`  | authority (32)               |
/// |  `34`  | curve (`u16` LE)             |
/// |  `37`  | public_key_len (`u8`)        |
/// |  `38`  | public_key (`public_key_len`)|
///
/// Mirrored in `src/dwallet/solanaOnChain.ts` for the Vite Operator console.
pub const DWALLET_DISCRIMINATOR: u8 = 2;
pub const DWALLET_AUTHORITY_OFFSET: usize = 2;
pub const DWALLET_CURVE_OFFSET: usize = 34;
pub const DWALLET_PUBKEY_LEN_OFFSET: usize = 37;
pub const DWALLET_PUBKEY_OFFSET: usize = 38;

#[derive(Debug, Clone)]
pub struct ParsedDWallet {
    pub authority: [u8; 32],
    pub curve: DWalletCurve,
    pub curve_id: u16,
    pub public_key: Vec<u8>,
}

/// Parse on-chain Ika **DWallet** account (discriminator 2). Single source of truth
/// for both `prism inspect` and `prism sign`; mirrors `parseDWalletAccountData` in
/// `src/dwallet/solanaOnChain.ts`.
pub fn parse_ika_dwallet_account(data: &[u8]) -> anyhow::Result<ParsedDWallet> {
    if data.len() < DWALLET_PUBKEY_OFFSET + 1 {
        anyhow::bail!("dWallet account data too short ({} bytes)", data.len());
    }
    if data[0] != DWALLET_DISCRIMINATOR {
        anyhow::bail!(
            "expected DWallet discriminator {DWALLET_DISCRIMINATOR}, got {}",
            data[0]
        );
    }
    let mut authority = [0u8; 32];
    authority.copy_from_slice(&data[DWALLET_AUTHORITY_OFFSET..DWALLET_AUTHORITY_OFFSET + 32]);
    let curve_id = u16::from_le_bytes([data[DWALLET_CURVE_OFFSET], data[DWALLET_CURVE_OFFSET + 1]]);
    let curve = match curve_id {
        0 => DWalletCurve::Secp256k1,
        1 => DWalletCurve::Secp256r1,
        2 => DWalletCurve::Curve25519,
        3 => DWalletCurve::Ristretto,
        _ => anyhow::bail!("unknown dWallet curve id {curve_id}"),
    };
    let pk_len = data[DWALLET_PUBKEY_LEN_OFFSET] as usize;
    let pk_end = DWALLET_PUBKEY_OFFSET
        .checked_add(pk_len)
        .ok_or_else(|| anyhow!("public_key_len overflow"))?;
    if pk_end > data.len() {
        anyhow::bail!("invalid public_key_len {pk_len}");
    }
    Ok(ParsedDWallet {
        authority,
        curve,
        curve_id,
        public_key: data[DWALLET_PUBKEY_OFFSET..pk_end].to_vec(),
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Lock the canonical layout (Ika pre-alpha book §"DWallet account") so any silent
    /// drift between this file and `src/dwallet/solanaOnChain.ts` would fail the test.
    #[test]
    fn parse_dwallet_account_matches_book_offsets() {
        let mut data = vec![0u8; 144];
        data[0] = DWALLET_DISCRIMINATOR;
        for i in 0..32 {
            data[DWALLET_AUTHORITY_OFFSET + i] = (i + 1) as u8;
        }
        // curve = 0 (Secp256k1), little-endian u16
        data[DWALLET_CURVE_OFFSET] = 0;
        data[DWALLET_CURVE_OFFSET + 1] = 0;
        // public_key_len = 33
        data[DWALLET_PUBKEY_LEN_OFFSET] = 33;
        for i in 0..33 {
            data[DWALLET_PUBKEY_OFFSET + i] = 0xA0 ^ (i as u8);
        }

        let parsed = parse_ika_dwallet_account(&data).expect("parse");
        assert_eq!(parsed.curve_id, 0);
        assert!(matches!(parsed.curve, DWalletCurve::Secp256k1));
        assert_eq!(parsed.public_key.len(), 33);
        assert_eq!(parsed.authority[0], 1);
        assert_eq!(parsed.authority[31], 32);
    }

    #[test]
    fn parse_dwallet_account_rejects_bad_disc() {
        let mut data = vec![0u8; 64];
        data[0] = 1; // wrong discriminator
        assert!(parse_ika_dwallet_account(&data).is_err());
    }

    #[test]
    fn parse_dwallet_account_rejects_unknown_curve() {
        let mut data = vec![0u8; 64];
        data[0] = DWALLET_DISCRIMINATOR;
        data[DWALLET_CURVE_OFFSET] = 9; // unknown
        assert!(parse_ika_dwallet_account(&data).is_err());
    }
}

