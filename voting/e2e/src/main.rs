use clap::Parser;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;

const SOLANA_RPC: &str = "https://api.devnet.solana.com";
const DWALLET_GRPC: &str = "https://pre-alpha-dev-1.ika.ika-network.net:443";
const DWALLET_PROGRAM_ID: &str = "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";

#[derive(Parser)]
#[command(name = "prism-voting-e2e")]
#[command(about = "End-to-end flow for voting-controlled dWallet signing")]
struct Cli {
    /// Path to a payer keypair file
    #[arg(short, long)]
    keypair: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Cli::parse();
    let rpc = RpcClient::new_with_commitment(SOLANA_RPC.to_string(), CommitmentConfig::confirmed());

    println!("=== PRISM voting E2E ===");
    println!("RPC:            {SOLANA_RPC}");
    println!("Ika gRPC:       {DWALLET_GRPC}");
    println!("dWallet program:{DWALLET_PROGRAM_ID}");
    println!("Payer keypair:  {}", args.keypair);
    println!();

    println!("1) Create 2 dWallets via DKG (Secp256k1 + Curve25519)");
    println!("2) Transfer authority to voting program CPI PDA");
    println!("3) Create proposal with quorum + message hash");
    println!("4) Cast votes and create VoteRecord PDAs");
    println!("5) On quorum, CPI approve_message is called automatically");
    println!("6) Poll MessageApproval until status = Signed");
    println!();

    println!("Scaffold is ready. Wire in transaction builders for your environment.");
    println!("Tip: reuse your existing `client/` helpers for account decoding.");

    // Sanity call to prove RPC is reachable
    let slot = rpc.get_slot()?;
    println!("Devnet reachable. Current slot: {slot}");

    Ok(())
}
