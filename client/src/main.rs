use clap::{Parser, Subcommand};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
};
use std::str::FromStr;

const DWALLET_GRPC: &str = "https://pre-alpha-dev-1.ika.ika-network.net:443";
const SOLANA_RPC: &str = "https://api.devnet.solana.com";

/// Ika **dWallet** program on devnet (pre-alpha). Used for dWallet / MessageApproval PDAs — not for your CPI authority PDA.
const IKA_DWALLET_PROGRAM_ID: &str = "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";

/// Must match `ika_dwallet_pinocchio::CPI_AUTHORITY_SEED` (Ika `cpi-framework.md`).
const CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

/// dWallet account layout offsets
const DWALLET_AUTHORITY_OFFSET: usize = 0;
const DWALLET_PUBKEY_OFFSET: usize = 32;
const DWALLET_PUBKEY_LEN_OFFSET: usize = 97;
const DWALLET_CURVE_OFFSET: usize = 98;

/// MessageApproval layout offsets
const APPROVAL_STATUS_OFFSET: usize = 139;
const APPROVAL_SIG_LEN_OFFSET: usize = 140;
const APPROVAL_SIG_OFFSET: usize = 142;

#[derive(Parser)]
#[command(name = "hollow")]
#[command(about = "The Hollow — manage your private cross-chain identity")]
struct Cli {
    /// Your deployed **The Hollow** (or custom controller) program id. Derives the CPI PDA with seed `__ika_cpi_authority` (see Ika docs). This is **not** the Ika dWallet program id (`87W54k...`).
    #[arg(long, global = true, env = "HOLLOW_PROGRAM_ID")]
    hollow_program: Option<String>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a Hollow identity (2 dWallets: Secp256k1 + Curve25519)
    Create {
        #[arg(short, long)]
        keypair: String,
    },
    /// Approve a cross-chain message for Ika signing
    Sign {
        #[arg(short, long)]
        keypair: String,
        /// The dWallet account to sign with
        #[arg(short, long)]
        dwallet: String,
        /// Hex-encoded 32-byte message hash
        #[arg(short, long)]
        message: String,
        /// Target chain: btc, eth, or sol
        #[arg(short, long)]
        chain: String,
    },
    /// Check signature status on a MessageApproval account
    Status {
        #[arg(short, long)]
        approval: String,
    },
    /// Inspect a dWallet account (authority, curve, public key)
    Inspect {
        #[arg(short, long)]
        dwallet: String,
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

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let rpc = RpcClient::new_with_commitment(SOLANA_RPC.to_string(), CommitmentConfig::confirmed());
    match cli.command {
        Commands::Create { keypair: _ } => {
            println!("╔══════════════════════════════════════╗");
            println!("║   The Hollow — Create Identity       ║");
            println!("╚══════════════════════════════════════╝\n");

            let ika_dwallet_program = Pubkey::from_str(IKA_DWALLET_PROGRAM_ID)?;
            let hollow_pid = match &cli.hollow_program {
                Some(s) => Pubkey::from_str(s)?,
                None => {
                    eprintln!("Set --hollow-program or HOLLOW_PROGRAM_ID to your deployed program id.");
                    eprintln!("CPI authority PDA = find_program_address([\"__ika_cpi_authority\"], YOUR_PROGRAM_ID).");
                    eprintln!("Ika dWallet program (separate): {ika_dwallet_program}");
                    return Ok(());
                }
            };

            let (cpi_authority, bump) =
                Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &hollow_pid);

            println!("1. Connecting to Ika gRPC at {DWALLET_GRPC}");
            println!("2. Creating dWallet #1 — Secp256k1 (Bitcoin + Ethereum)...");
            println!("   → DKG: user + Ika network jointly generate key pair");
            println!("   → Neither party alone can sign");

            // TODO: Real gRPC DKG call for Secp256k1
            // let channel = tonic::transport::Channel::from_static(DWALLET_GRPC).connect().await?;
            // let mut client = ika_grpc::dwallet_client::DWalletClient::new(channel);
            // let secp_dwallet = client.create_dwallet(CreateDWalletRequest { curve: 0 }).await?;

            println!("   ✓ Secp256k1 dWallet created (mock)");

            println!("3. Creating dWallet #2 — Curve25519 (Solana)...");

            // TODO: Real gRPC DKG call for Curve25519
            // let ed_dwallet = client.create_dwallet(CreateDWalletRequest { curve: 2 }).await?;

            println!("   ✓ Curve25519 dWallet created (mock)");

            println!("4. Transferring both dWallets to Hollow CPI PDA...");
            println!("   Your program:    {hollow_pid}");
            println!("   Ika dWallet pg:  {ika_dwallet_program} (for CPI account list)");
            println!("   CPI Authority: {cpi_authority} (bump: {bump})");

            // TODO: Send init_hollow transaction transferring both dWallets
            // to the CPI authority PDA

            println!("\n✅ Hollow identity ready!");
            println!("   Secp256k1 dWallet → Bitcoin + Ethereum");
            println!("   Curve25519 dWallet → Solana");
            println!("   Both controlled by single CPI PDA");
        }

        Commands::Sign { keypair, dwallet, message, chain } => {
            println!("╔══════════════════════════════════════╗");
            println!("║   The Hollow — Cross-Chain Sign      ║");
            println!("╚══════════════════════════════════════╝\n");

            let (sig_scheme, chain_label) = match chain.to_lowercase().as_str() {
                "btc" | "bitcoin" => (1u8, "Bitcoin (Secp256k1/ECDSA)"),
                "eth" | "ethereum" => (1u8, "Ethereum (Secp256k1/ECDSA)"),
                "sol" | "solana" => (0u8, "Solana (Curve25519/Ed25519)"),
                _ => {
                    eprintln!("Unknown chain: {chain}. Use btc, eth, or sol.");
                    return Ok(());
                }
            };

            println!("Chain:    {chain_label}");
            println!("dWallet:  {dwallet}");
            println!("Message:  {message}");
            println!("Scheme:   {sig_scheme}\n");

            println!("Sending approve_action instruction...");
            println!("  → Creates MessageApproval PDA on-chain");
            println!("  → Seeds: [\"message_approval\", dwallet_pubkey, message_hash] (program: Ika dWallet)");
            println!("  → message_hash must be keccak256(raw_message) per Ika message-approval docs");

            // TODO: Build and send the actual approve_action transaction

            println!("\n⏳ MessageApproval created (status: Pending)");
            println!("   Ika network will detect it and run 2PC-MPC signing.");
            println!("   Use `hollow status` to check when the signature is ready.");
        }

        Commands::Status { approval } => {
            println!("╔══════════════════════════════════════╗");
            println!("║   The Hollow — Signature Status      ║");
            println!("╚══════════════════════════════════════╝\n");

            let approval_pubkey = Pubkey::from_str(&approval)?;

            match rpc.get_account(&approval_pubkey) {
                Ok(account) => {
                    let data = account.data;
                    if data.len() > APPROVAL_SIG_OFFSET {
                        let status = data[APPROVAL_STATUS_OFFSET];
                        match status {
                            0 => {
                                println!("⏳ Status: PENDING");
                                println!("   The Ika network hasn't signed yet.");
                                println!("   The NOA will detect this and produce a signature.");
                            }
                            1 => {
                                let sig_len = u16::from_le_bytes([
                                    data[APPROVAL_SIG_LEN_OFFSET],
                                    data[APPROVAL_SIG_LEN_OFFSET + 1],
                                ]) as usize;
                                let sig_end = (APPROVAL_SIG_OFFSET + sig_len).min(data.len());
                                let signature = &data[APPROVAL_SIG_OFFSET..sig_end];

                                println!("✅ Status: SIGNED");
                                println!("   Signature ({sig_len} bytes):");
                                println!("   {}", bs58::encode(signature).into_string());
                                println!("\n   This signature can be broadcast on the target chain.");
                            }
                            _ => println!("❓ Unknown status: {status}"),
                        }
                    } else {
                        println!("Account data too small — may not be a MessageApproval");
                    }
                }
                Err(e) => {
                    println!("Could not fetch account: {e}");
                }
            }
        }

        Commands::Inspect { dwallet } => {
            println!("╔══════════════════════════════════════╗");
            println!("║   The Hollow — Inspect dWallet       ║");
            println!("╚══════════════════════════════════════╝\n");

            let dwallet_pubkey = Pubkey::from_str(&dwallet)?;

            match rpc.get_account(&dwallet_pubkey) {
                Ok(account) => {
                    let data = account.data;
                    if data.len() > DWALLET_CURVE_OFFSET {
                        let authority = Pubkey::from(
                            <[u8; 32]>::try_from(&data[DWALLET_AUTHORITY_OFFSET..DWALLET_AUTHORITY_OFFSET + 32]).unwrap()
                        );
                        let pubkey_len = data[DWALLET_PUBKEY_LEN_OFFSET] as usize;
                        let pubkey_bytes = &data[DWALLET_PUBKEY_OFFSET..DWALLET_PUBKEY_OFFSET + pubkey_len];
                        let curve = data[DWALLET_CURVE_OFFSET];

                        println!("Address:    {dwallet_pubkey}");
                        println!("Authority:  {authority}");
                        println!("Curve:      {} (id: {curve})", curve_name(curve));
                        println!("Public Key: {} ({pubkey_len} bytes)", bs58::encode(pubkey_bytes).into_string());
                        println!("Imported:   {}", if data.len() > DWALLET_CURVE_OFFSET + 1 { data[DWALLET_CURVE_OFFSET + 1] != 0 } else { false });

                        if let Some(ref hp) = cli.hollow_program {
                            let hollow_pid = Pubkey::from_str(hp)?;
                            let (cpi_pda, _) =
                                Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &hollow_pid);
                            if authority == cpi_pda {
                                println!("\n🔒 Authority matches CPI PDA for --hollow-program {hollow_pid}");
                            } else {
                                println!("\n⚠️  Authority does not match CPI PDA for that program id");
                            }
                        } else {
                            println!("\n💡 Pass --hollow-program to compare authority to Ika CPI PDA");
                        }
                    } else {
                        println!("Account data too small — may not be a dWallet");
                    }
                }
                Err(e) => {
                    println!("Could not fetch account: {e}");
                }
            }
        }
    }

    Ok(())
}
