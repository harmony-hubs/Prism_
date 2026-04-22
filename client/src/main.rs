//! `prism` CLI — Ika gRPC (DKG, sign) + Solana txs for the PRISM program. Instruction discriminators match
//! `program/src/lib.rs`. Reference: [Ika dWallet book](https://solana-pre-alpha.ika.xyz/print.html) (pre-alpha).
mod ika_client;
mod rpc_light;

use anyhow::Context;
use clap::{Parser, Subcommand};
use ika_client::{
    connect_grpc, finish_dkg_result, find_message_approval_pda, parse_dkg_attestation, parse_ika_dwallet_account,
    request_presign, request_sign, submit_dkg,
};
use ika_dwallet_types::{DWalletCurve, DWalletHashScheme, DWalletSignatureAlgorithm};
use rpc_light::{poll_dwallet_live, wait_for_coordinator, RpcLight};
use solana_commitment_config::CommitmentConfig;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_pubkey::pubkey;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::str::FromStr;

/// Native loader / System program (same as `solana_sdk::system_program::ID`).
const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

const DWALLET_GRPC: &str = "https://pre-alpha-dev-1.ika.ika-network.net:443";
const SOLANA_RPC: &str = "https://api.devnet.solana.com";

const IKA_DWALLET_PROGRAM_ID: &str = "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";
const CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

const INIT_PRISM: u8 = 0;
const APPROVE_ACTION: u8 = 1;
const INIT_ENCRYPT_POLICY_GATE: u8 = 3;
const SET_ENCRYPT_POLICY_ELIGIBLE: u8 = 4;
const APPROVE_ACTION_GATED: u8 = 5;
const SPRING_INACTIVITY: u8 = 10;
const SPRING_PANIC: u8 = 11;

const SOVEREIGN_SEED: &[u8] = b"prism_sovereign";

/// Clock sysvar (must match on-chain `SysvarC1ock1111…` base58).
const CLOCK_SYSVAR: Pubkey = pubkey!("SysvarC1ock1111111111111111111111111111111");

/// Rent sysvar (required by `init_encrypt_policy_gate`).
const RENT_SYSVAR: Pubkey = pubkey!("SysvarRent111111111111111111111111111111111");

const DWALLET_AUTHORITY_OFFSET: usize = 0;
const DWALLET_PUBKEY_OFFSET: usize = 32;
const DWALLET_PUBKEY_LEN_OFFSET: usize = 97;
const DWALLET_CURVE_OFFSET: usize = 98;

const APPROVAL_STATUS_OFFSET: usize = 172;
const APPROVAL_SIG_LEN_OFFSET: usize = 173;
const APPROVAL_SIG_OFFSET: usize = 175;

#[derive(Parser)]
#[command(name = "prism")]
#[command(about = "PRISM — Ika gRPC + Solana dWallet client (pre-alpha)")]
struct Cli {
    #[arg(long = "prism-program", visible_alias = "hollow-program", global = true, env = "PRISM_PROGRAM_ID")]
    prism_program: Option<String>,
    #[arg(long, global = true, env = "IKA_GRPC_URL", default_value = DWALLET_GRPC)]
    grpc_url: String,
    #[arg(long, global = true, env = "SOLANA_RPC_URL", default_value = SOLANA_RPC)]
    solana_rpc: String,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// gRPC DKG (×2 curves) → optional `init_prism` to transfer authority to CPI PDA
    Create {
        #[arg(short, long)]
        keypair: String,
    },
    /// On-chain `approve_message` via PRISM program, then gRPC presign + sign (mock)
    Sign {
        #[arg(short, long)]
        keypair: String,
        #[arg(short, long)]
        dwallet: String,
        /// 64 hex chars (32-byte keccak256 preimage hash) for MessageApproval PDA + gRPC message bytes
        #[arg(short, long)]
        message: String,
        #[arg(short, long)]
        chain: String,
        /// Use `approve_action_gated` (requires policy PDA with eligible=1 — see `policy-init` / `policy-set`)
        #[arg(long)]
        gated: bool,
    },
    /// Create Encrypt policy gate PDA `["prism_policy", owner, message_hash]` (1 byte; starts at 0)
    PolicyInit {
        #[arg(short, long)]
        keypair: String,
        #[arg(short, long)]
        message: String,
    },
    /// Set eligibility on policy gate (demo: owner sets `1` after Encrypt graph; production: restrict signers)
    PolicySet {
        #[arg(short, long)]
        keypair: String,
        #[arg(short, long)]
        message: String,
        #[arg(long, default_value_t = 1)]
        eligible: u8,
    },
    Status {
        #[arg(short, long)]
        approval: String,
    },
    Inspect {
        #[arg(short, long)]
        dwallet: String,
    },
    /// Permissionless: `spring_inactivity` (Ika `transfer_dwallet` to recovery after inactivity)
    #[command(visible_alias = "snap-inactivity")]
    SnapInactivity {
        #[arg(short, long)]
        keypair: String,
        /// `prism_sovereign` PDA base58
        #[arg(long, group = "sovereign_target")]
        sovereign: Option<String>,
        /// Owner pubkey — derives sovereign PDA
        #[arg(long, group = "sovereign_target")]
        owner: Option<String>,
        #[arg(long)]
        dwallet_secp: String,
        #[arg(long)]
        dwallet_ed: String,
    },
    /// Permissionless: `spring_panic` (Ika transfer when last_attested is below panic_floor)
    #[command(visible_alias = "snap-panic")]
    SnapPanic {
        #[arg(short, long)]
        keypair: String,
        #[arg(long, group = "sovereign_target2")]
        sovereign: Option<String>,
        #[arg(long, group = "sovereign_target2")]
        owner: Option<String>,
        #[arg(long)]
        dwallet_secp: String,
        #[arg(long)]
        dwallet_ed: String,
    },
}

fn curve_name(id: u8) -> &'static str {
    match id {
        0 => "Secp256k1 (BTC/ETH)",
        1 => "Secp256r1 (WebAuthn)",
        2 => "Curve25519 (SOL)",
        3 => "Ristretto (Substrate)",
        _ => "Unknown",
    }
}

fn load_keypair(path: &str) -> anyhow::Result<Keypair> {
    let data = std::fs::read(path).with_context(|| format!("read keypair {path}"))?;
    let bytes: Vec<u8> = serde_json::from_slice(&data).context("keypair JSON")?;
    Keypair::try_from(bytes.as_slice()).map_err(|e| anyhow::anyhow!("{e}"))
}

fn grpc_endpoint(url: &str) -> String {
    if url.starts_with("https://") || url.starts_with("http://") {
        url.to_string()
    } else {
        format!("https://{url}")
    }
}

/// Per-chain crypto + **`DWalletSignatureScheme` (u16)** for MessageApproval PDA seeds and `approve_message`.
/// See `ika-dwallet-types::DWalletSignatureScheme` (0 = EcdsaKeccak256 … 5 = EddsaSha512 …).
fn chain_crypto(chain: &str) -> (DWalletCurve, DWalletSignatureAlgorithm, DWalletHashScheme, u16, &'static str) {
    match chain.to_lowercase().as_str() {
        "btc" | "bitcoin" => (
            DWalletCurve::Secp256k1,
            DWalletSignatureAlgorithm::ECDSASecp256k1,
            DWalletHashScheme::DoubleSHA256,
            2, // EcdsaDoubleSha256
            "Bitcoin (Secp256k1 / double-SHA256)",
        ),
        "eth" | "ethereum" => (
            DWalletCurve::Secp256k1,
            DWalletSignatureAlgorithm::ECDSASecp256k1,
            DWalletHashScheme::Keccak256,
            0, // EcdsaKeccak256
            "Ethereum (Secp256k1 / Keccak256)",
        ),
        "sol" | "solana" => (
            DWalletCurve::Curve25519,
            DWalletSignatureAlgorithm::EdDSA,
            DWalletHashScheme::SHA512,
            5, // EddsaSha512
            "Solana (Ed25519 / SHA-512)",
        ),
        _ => (
            DWalletCurve::Curve25519,
            DWalletSignatureAlgorithm::EdDSA,
            DWalletHashScheme::SHA512,
            5,
            "unknown",
        ),
    }
}

fn build_init_prism_ix(
    prism_program: Pubkey,
    owner: Pubkey,
    dwallet_secp: Pubkey,
    dwallet_ed: Pubkey,
    ika_dwallet_program: Pubkey,
    cpi_authority: Pubkey,
) -> Instruction {
    Instruction {
        program_id: prism_program,
        accounts: vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new(dwallet_secp, false),
            AccountMeta::new(dwallet_ed, false),
            AccountMeta::new_readonly(ika_dwallet_program, false),
            AccountMeta::new_readonly(cpi_authority, false),
            AccountMeta::new_readonly(prism_program, false),
        ],
        data: vec![INIT_PRISM],
    }
}

fn build_approve_action_ix(
    prism_program: Pubkey,
    owner: Pubkey,
    coordinator: Pubkey,
    message_approval: Pubkey,
    dwallet: Pubkey,
    payer: Pubkey,
    ika_dwallet_program: Pubkey,
    cpi_authority: Pubkey,
    message_hash: [u8; 32],
    user_pubkey: [u8; 32],
    signature_scheme: u16,
    msg_approval_bump: u8,
) -> Instruction {
    let mut data = Vec::with_capacity(100);
    data.push(APPROVE_ACTION);
    data.extend_from_slice(&message_hash);
    data.extend_from_slice(&[0u8; 32]); // message_metadata_digest (unused for Keccak paths)
    data.extend_from_slice(&user_pubkey);
    data.extend_from_slice(&signature_scheme.to_le_bytes());
    data.push(msg_approval_bump);
    Instruction {
        program_id: prism_program,
        accounts: vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new_readonly(coordinator, false),
            AccountMeta::new(message_approval, false),
            AccountMeta::new_readonly(dwallet, false),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
            AccountMeta::new_readonly(ika_dwallet_program, false),
            AccountMeta::new_readonly(cpi_authority, false),
            AccountMeta::new_readonly(prism_program, false),
        ],
        data,
    }
}

fn find_policy_gate_pda(owner: Pubkey, message_hash: [u8; 32], prism_program: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"prism_policy".as_ref(), owner.as_ref(), message_hash.as_ref()],
        &prism_program,
    )
}

fn find_sovereign_pda(owner: &Pubkey, prism_program: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SOVEREIGN_SEED, owner.as_ref()], prism_program)
}

fn resolve_sovereign_pda(
    sovereign: Option<String>,
    owner: Option<String>,
    prism_program: &Pubkey,
) -> anyhow::Result<Pubkey> {
    match (sovereign, owner) {
        (Some(s), None) => Pubkey::from_str(&s).context("sovereign"),
        (None, Some(o)) => {
            let ow = Pubkey::from_str(&o).context("owner")?;
            Ok(find_sovereign_pda(&ow, prism_program).0)
        }
        (Some(_), Some(_)) => Err(anyhow::anyhow!("use only one of --sovereign or --owner")),
        (None, None) => Err(anyhow::anyhow!("set --sovereign <PDA> or --owner <pubkey>")),
    }
}

fn build_spring_inactivity_ix(
    prism_program: Pubkey,
    sovereign: Pubkey,
    clock: Pubkey,
    dwallet_secp: Pubkey,
    dwallet_ed: Pubkey,
    ika_dwallet_program: Pubkey,
    cpi_authority: Pubkey,
) -> Instruction {
    Instruction {
        program_id: prism_program,
        accounts: vec![
            AccountMeta::new(sovereign, false),
            AccountMeta::new_readonly(clock, false),
            AccountMeta::new(dwallet_secp, false),
            AccountMeta::new(dwallet_ed, false),
            AccountMeta::new_readonly(ika_dwallet_program, false),
            AccountMeta::new_readonly(cpi_authority, false),
            AccountMeta::new_readonly(prism_program, false),
        ],
        data: vec![SPRING_INACTIVITY],
    }
}

fn build_spring_panic_ix(
    prism_program: Pubkey,
    sovereign: Pubkey,
    clock: Pubkey,
    dwallet_secp: Pubkey,
    dwallet_ed: Pubkey,
    ika_dwallet_program: Pubkey,
    cpi_authority: Pubkey,
) -> Instruction {
    Instruction {
        program_id: prism_program,
        accounts: vec![
            AccountMeta::new(sovereign, false),
            AccountMeta::new_readonly(clock, false),
            AccountMeta::new(dwallet_secp, false),
            AccountMeta::new(dwallet_ed, false),
            AccountMeta::new_readonly(ika_dwallet_program, false),
            AccountMeta::new_readonly(cpi_authority, false),
            AccountMeta::new_readonly(prism_program, false),
        ],
        data: vec![SPRING_PANIC],
    }
}

fn build_init_encrypt_policy_gate_ix(
    prism_program: Pubkey,
    owner: Pubkey,
    policy_pda: Pubkey,
    payer: Pubkey,
    message_hash: [u8; 32],
) -> Instruction {
    let mut data = Vec::with_capacity(33);
    data.push(INIT_ENCRYPT_POLICY_GATE);
    data.extend_from_slice(&message_hash);
    Instruction {
        program_id: prism_program,
        accounts: vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new(policy_pda, false),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(RENT_SYSVAR, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
        ],
        data,
    }
}

fn build_set_encrypt_policy_eligible_ix(
    prism_program: Pubkey,
    owner: Pubkey,
    policy_pda: Pubkey,
    message_hash: [u8; 32],
    eligible: u8,
) -> Instruction {
    let mut data = Vec::with_capacity(34);
    data.push(SET_ENCRYPT_POLICY_ELIGIBLE);
    data.extend_from_slice(&message_hash);
    data.push(eligible);
    Instruction {
        program_id: prism_program,
        accounts: vec![AccountMeta::new_readonly(owner, true), AccountMeta::new(policy_pda, false)],
        data,
    }
}

fn build_approve_action_gated_ix(
    prism_program: Pubkey,
    owner: Pubkey,
    coordinator: Pubkey,
    message_approval: Pubkey,
    dwallet: Pubkey,
    payer: Pubkey,
    ika_dwallet_program: Pubkey,
    cpi_authority: Pubkey,
    policy_pda: Pubkey,
    message_hash: [u8; 32],
    user_pubkey: [u8; 32],
    signature_scheme: u16,
    msg_approval_bump: u8,
) -> Instruction {
    let mut data = Vec::with_capacity(100);
    data.push(APPROVE_ACTION_GATED);
    data.extend_from_slice(&message_hash);
    data.extend_from_slice(&[0u8; 32]);
    data.extend_from_slice(&user_pubkey);
    data.extend_from_slice(&signature_scheme.to_le_bytes());
    data.push(msg_approval_bump);
    Instruction {
        program_id: prism_program,
        accounts: vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new_readonly(coordinator, false),
            AccountMeta::new(message_approval, false),
            AccountMeta::new_readonly(dwallet, false),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
            AccountMeta::new_readonly(ika_dwallet_program, false),
            AccountMeta::new_readonly(cpi_authority, false),
            AccountMeta::new_readonly(prism_program, false),
            AccountMeta::new_readonly(policy_pda, false),
        ],
        data,
    }
}

fn parse_hex32(s: &str) -> anyhow::Result<[u8; 32]> {
    let t = s.trim().strip_prefix("0x").unwrap_or(s.trim());
    let v = hex::decode(t).context("hex decode")?;
    if v.len() != 32 {
        return Err(anyhow::anyhow!("expected 32 bytes (64 hex chars), got {}", v.len()));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&v);
    Ok(out)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let rpc = RpcLight::new(cli.solana_rpc.clone(), CommitmentConfig::confirmed());
    let ika_dwallet_program = Pubkey::from_str(IKA_DWALLET_PROGRAM_ID)?;
    let grpc = grpc_endpoint(&cli.grpc_url);

    match cli.command {
        Commands::Create { keypair } => {
            let payer = load_keypair(&keypair)?;
            let prism_pid = match &cli.prism_program {
                Some(s) => Pubkey::from_str(s).context("PRISM_PROGRAM_ID")?,
                None => {
                    eprintln!("Create: set --prism-program / PRISM_PROGRAM_ID to run init_prism after DKG.");
                    eprintln!("Continuing with gRPC DKG only (no on-chain authority transfer).");
                    Pubkey::default()
                }
            };

            println!("Connecting to Ika gRPC: {grpc}");
            let mut client = connect_grpc(&grpc).await?;

            println!("Waiting for DWalletCoordinator on devnet…");
            wait_for_coordinator(&rpc, &ika_dwallet_program).await?;

            println!("DKG — Secp256k1 (BTC/ETH)…");
            let raw_secp = submit_dkg(&mut client, &payer, DWalletCurve::Secp256k1).await?;
            let att_secp = parse_dkg_attestation(&raw_secp)?;
            let dkg_secp = finish_dkg_result(att_secp, DWalletCurve::Secp256k1, &ika_dwallet_program)?;
            println!("  dWallet PDA: {}", dkg_secp.dwallet_pda);
            println!("  session id:  {}", hex::encode(dkg_secp.dwallet_id));
            poll_dwallet_live(&rpc, &dkg_secp.dwallet_pda).await?;
            println!("  On-chain dWallet confirmed.");

            println!("DKG — Curve25519 (SOL)…");
            let raw_ed = submit_dkg(&mut client, &payer, DWalletCurve::Curve25519).await?;
            let att_ed = parse_dkg_attestation(&raw_ed)?;
            let dkg_ed = finish_dkg_result(att_ed, DWalletCurve::Curve25519, &ika_dwallet_program)?;
            println!("  dWallet PDA: {}", dkg_ed.dwallet_pda);
            println!("  session id:  {}", hex::encode(dkg_ed.dwallet_id));
            poll_dwallet_live(&rpc, &dkg_ed.dwallet_pda).await?;
            println!("  On-chain dWallet confirmed.");

            if prism_pid != Pubkey::default() {
                let (cpi_authority, bump) = Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &prism_pid);
                println!("\nSubmitting init_prism (authority → CPI PDA)…");
                println!("  PRISM program: {prism_pid}");
                println!("  CPI authority:  {cpi_authority} (bump {bump})");

                let ix = build_init_prism_ix(
                    prism_pid,
                    payer.pubkey(),
                    dkg_secp.dwallet_pda,
                    dkg_ed.dwallet_pda,
                    ika_dwallet_program,
                    cpi_authority,
                );
                let bh = rpc.get_latest_blockhash()?;
                let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
                let sig = rpc.send_and_confirm_transaction(&tx)?;
                println!("  ✓ init_prism tx: {sig}");
            }

            println!("\nSecp256k1 dWallet: {}", dkg_secp.dwallet_pda);
            println!("Curve25519 dWallet: {}", dkg_ed.dwallet_pda);
        }

        Commands::Sign {
            keypair,
            dwallet,
            message,
            chain,
            gated,
        } => {
            let payer = load_keypair(&keypair)?;
            let prism_pid = cli
                .prism_program
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("set --prism-program / PRISM_PROGRAM_ID"))?;
            let prism_program = Pubkey::from_str(prism_pid).context("PRISM_PROGRAM_ID")?;

            let (curve, sig_alg, _, scheme_u16, chain_label) = chain_crypto(&chain);
            if chain_label == "unknown" {
                return Err(anyhow::anyhow!("Unknown chain: {chain}. Use btc, eth, or sol."));
            }

            let dwallet_pk = Pubkey::from_str(&dwallet).context("dwallet")?;
            let message_hash = parse_hex32(&message)?;

            let acc = rpc
                .get_account(&dwallet_pk)
                .context("get_account dWallet")?
                .ok_or_else(|| anyhow::anyhow!("dWallet account not found at {dwallet_pk}"))?;
            let (dwallet_curve, pk_bytes) = parse_ika_dwallet_account(&acc.data)?;
            let (msg_appr, bump) = find_message_approval_pda(
                dwallet_curve,
                &pk_bytes,
                scheme_u16,
                &message_hash,
                &ika_dwallet_program,
            );

            let user_pubkey = payer.pubkey().to_bytes();

            println!("Chain:     {chain_label}");
            println!("dWallet:   {dwallet_pk}");
            println!("Msg hash:  {}…", hex::encode(message_hash));
            println!("DWalletSignatureScheme (u16 LE): {scheme_u16}");
            println!("Msg appr:  {msg_appr} (bump {bump})\n");

            let cpi_authority = Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &prism_program).0;
            let (coordinator, _) = Pubkey::find_program_address(&[b"dwallet_coordinator"], &ika_dwallet_program);
            let ix = if gated {
                let (policy_pda, _) = find_policy_gate_pda(payer.pubkey(), message_hash, prism_program);
                println!("Policy gate PDA: {policy_pda} (must be eligible=1; use `policy-init` / `policy-set`)\n");
                build_approve_action_gated_ix(
                    prism_program,
                    payer.pubkey(),
                    coordinator,
                    msg_appr,
                    dwallet_pk,
                    payer.pubkey(),
                    ika_dwallet_program,
                    cpi_authority,
                    policy_pda,
                    message_hash,
                    user_pubkey,
                    scheme_u16,
                    bump,
                )
            } else {
                build_approve_action_ix(
                    prism_program,
                    payer.pubkey(),
                    coordinator,
                    msg_appr,
                    dwallet_pk,
                    payer.pubkey(),
                    ika_dwallet_program,
                    cpi_authority,
                    message_hash,
                    user_pubkey,
                    scheme_u16,
                    bump,
                )
            };

            println!(
                "Sending {}…",
                if gated {
                    "approve_action_gated"
                } else {
                    "approve_action"
                }
            );
            let bh = rpc.get_latest_blockhash()?;
            let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
            let tx_sig = rpc.send_and_confirm_transaction(&tx)?;
            let slot = rpc.get_slot()?;
            println!("  MessageApproval tx: {tx_sig} (slot {slot})");

            let session_preimage = dwallet_pk.to_bytes();
            let dwallet_pk_bytes = dwallet_pk.to_bytes().to_vec();

            println!("gRPC presign…");
            let mut client = connect_grpc(&grpc).await?;
            let presign_id = request_presign(
                &mut client,
                &payer,
                session_preimage,
                dwallet_pk_bytes,
                curve,
                sig_alg,
            )
            .await?;
            println!("  presign_id: {} bytes", presign_id.len());

            println!("gRPC sign…");
            let sig_bytes = request_sign(
                &mut client,
                &payer,
                session_preimage,
                &message_hash,
                &presign_id,
                tx_sig.as_ref(),
                slot,
            )
            .await?;
            println!(
                "✓ Signature ({} bytes): {}",
                sig_bytes.len(),
                bs58::encode(&sig_bytes).into_string()
            );
        }

        Commands::Status { approval } => {
            let approval_pubkey = Pubkey::from_str(&approval)?;
            match rpc.get_account(&approval_pubkey) {
                Ok(Some(account)) => {
                    let data = account.data;
                    if data.len() > APPROVAL_SIG_OFFSET {
                        let status = data[APPROVAL_STATUS_OFFSET];
                        match status {
                            0 => {
                                println!("⏳ Status: PENDING");
                                println!("   The Ika network hasn't signed yet.");
                            }
                            1 => {
                                let sig_len = u16::from_le_bytes([
                                    data[APPROVAL_SIG_LEN_OFFSET],
                                    data[APPROVAL_SIG_LEN_OFFSET + 1],
                                ]) as usize;
                                let sig_end = (APPROVAL_SIG_OFFSET + sig_len).min(data.len());
                                let signature = &data[APPROVAL_SIG_OFFSET..sig_end];
                                println!("✅ Status: SIGNED");
                                println!(
                                    "   Signature ({} bytes): {}",
                                    sig_len,
                                    bs58::encode(signature).into_string()
                                );
                            }
                            _ => println!("❓ Unknown status: {status}"),
                        }
                    } else {
                        println!("Account data too small — may not be a MessageApproval");
                    }
                }
                Ok(None) => println!("Account not found"),
                Err(e) => println!("Could not fetch account: {e}"),
            }
        }

        Commands::PolicyInit { keypair, message } => {
            let payer = load_keypair(&keypair)?;
            let prism_program = Pubkey::from_str(
                cli.prism_program
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("set --prism-program / PRISM_PROGRAM_ID"))?,
            )
            .context("PRISM_PROGRAM_ID")?;
            let message_hash = parse_hex32(&message)?;
            let (policy_pda, bump) = find_policy_gate_pda(payer.pubkey(), message_hash, prism_program);
            println!("Creating Encrypt policy gate PDA…");
            println!("  policy_pda: {policy_pda} (bump {bump})");
            let ix = build_init_encrypt_policy_gate_ix(
                prism_program,
                payer.pubkey(),
                policy_pda,
                payer.pubkey(),
                message_hash,
            );
            let bh = rpc.get_latest_blockhash()?;
            let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
            let sig = rpc.send_and_confirm_transaction(&tx)?;
            println!("✓ init_encrypt_policy_gate tx: {sig}");
        }

        Commands::PolicySet {
            keypair,
            message,
            eligible,
        } => {
            if eligible > 1 {
                return Err(anyhow::anyhow!("eligible must be 0 or 1"));
            }
            let payer = load_keypair(&keypair)?;
            let prism_program = Pubkey::from_str(
                cli.prism_program
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("set --prism-program / PRISM_PROGRAM_ID"))?,
            )
            .context("PRISM_PROGRAM_ID")?;
            let message_hash = parse_hex32(&message)?;
            let (policy_pda, _) = find_policy_gate_pda(payer.pubkey(), message_hash, prism_program);
            println!("Setting policy gate eligible={eligible}…");
            println!("  policy_pda: {policy_pda}");
            let ix = build_set_encrypt_policy_eligible_ix(
                prism_program,
                payer.pubkey(),
                policy_pda,
                message_hash,
                eligible,
            );
            let bh = rpc.get_latest_blockhash()?;
            let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
            let sig = rpc.send_and_confirm_transaction(&tx)?;
            println!("✓ set_encrypt_policy_eligible tx: {sig}");
        }

        Commands::Inspect { dwallet } => {
            let dwallet_pubkey = Pubkey::from_str(&dwallet)?;
            match rpc.get_account(&dwallet_pubkey) {
                Ok(Some(account)) => {
                    let data = account.data;
                    if data.len() > DWALLET_CURVE_OFFSET {
                        let authority = Pubkey::from(
                            <[u8; 32]>::try_from(&data[DWALLET_AUTHORITY_OFFSET..DWALLET_AUTHORITY_OFFSET + 32]).unwrap(),
                        );
                        let pubkey_len = data[DWALLET_PUBKEY_LEN_OFFSET] as usize;
                        let pubkey_bytes = &data[DWALLET_PUBKEY_OFFSET..DWALLET_PUBKEY_OFFSET + pubkey_len];
                        let curve = data[DWALLET_CURVE_OFFSET];
                        println!("Address:    {dwallet_pubkey}");
                        println!("Authority:  {authority}");
                        println!("Curve:      {} (id: {curve})", curve_name(curve));
                        println!(
                            "Public Key: {} ({pubkey_len} bytes)",
                            bs58::encode(pubkey_bytes).into_string()
                        );
                        if let Some(ref hp) = cli.prism_program {
                            let prism_pid = Pubkey::from_str(hp)?;
                            let (cpi_pda, _) = Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &prism_pid);
                            if authority == cpi_pda {
                                println!("\n🔒 Authority matches CPI PDA for PRISM program {prism_pid}");
                            } else {
                                println!("\n⚠️  Authority does not match CPI PDA for that program id");
                            }
                        }
                    } else {
                        println!("Account data too small — may not be a dWallet");
                    }
                }
                Ok(None) => println!("Account not found"),
                Err(e) => println!("Could not fetch account: {e}"),
            }
        }

        Commands::SnapInactivity {
            keypair,
            sovereign,
            owner,
            dwallet_secp,
            dwallet_ed,
        } => {
            let payer = load_keypair(&keypair)?;
            let prism_program = Pubkey::from_str(
                cli.prism_program
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("set --prism-program / PRISM_PROGRAM_ID"))?,
            )
            .context("PRISM_PROGRAM_ID")?;
            let sov = resolve_sovereign_pda(sovereign, owner, &prism_program)?;
            let secp = Pubkey::from_str(&dwallet_secp).context("dwallet_secp")?;
            let ed = Pubkey::from_str(&dwallet_ed).context("dwallet_ed")?;
            let cpi = Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &prism_program).0;
            let ix = build_spring_inactivity_ix(
                prism_program,
                sov,
                CLOCK_SYSVAR,
                secp,
                ed,
                ika_dwallet_program,
                cpi,
            );
            println!("spring_inactivity");
            println!("  sovereign:     {sov}");
            println!("  dwallet secp:  {secp}");
            println!("  dwallet ed:    {ed}");
            let bh = rpc.get_latest_blockhash()?;
            let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
            let sig = rpc.send_and_confirm_transaction(&tx)?;
            println!("✓ tx: {sig}");
        }

        Commands::SnapPanic {
            keypair,
            sovereign,
            owner,
            dwallet_secp,
            dwallet_ed,
        } => {
            let payer = load_keypair(&keypair)?;
            let prism_program = Pubkey::from_str(
                cli.prism_program
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("set --prism-program / PRISM_PROGRAM_ID"))?,
            )
            .context("PRISM_PROGRAM_ID")?;
            let sov = resolve_sovereign_pda(sovereign, owner, &prism_program)?;
            let secp = Pubkey::from_str(&dwallet_secp).context("dwallet_secp")?;
            let ed = Pubkey::from_str(&dwallet_ed).context("dwallet_ed")?;
            let cpi = Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &prism_program).0;
            let ix = build_spring_panic_ix(
                prism_program,
                sov,
                CLOCK_SYSVAR,
                secp,
                ed,
                ika_dwallet_program,
                cpi,
            );
            println!("spring_panic");
            println!("  sovereign:     {sov}");
            println!("  dwallet secp:  {secp}");
            println!("  dwallet ed:    {ed}");
            let bh = rpc.get_latest_blockhash()?;
            let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
            let sig = rpc.send_and_confirm_transaction(&tx)?;
            println!("✓ tx: {sig}");
        }
    }

    Ok(())
}
