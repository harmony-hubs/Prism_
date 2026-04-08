#![no_std]
extern crate alloc;

use ika_dwallet_pinocchio::{CPI_AUTHORITY_SEED, DWalletContext};
use pinocchio::{entrypoint, error::ProgramError, AccountView, Address, ProgramResult};

entrypoint!(process_instruction);
pinocchio::nostd_panic_handler!();

/// Deployed **The Hollow** program id. After `solana program deploy`, set this to match (see Ika quick-start `Address::from_str_const`).
pub const ID: Address = Address::new_from_array([0u8; 32]);

// ─── Instruction discriminators ───
const INIT_HOLLOW: u8 = 0;
const APPROVE_ACTION: u8 = 1;
const TRANSFER_AUTHORITY: u8 = 2;

// ─── Ika dWallet curves ───
// A Hollow identity uses 2 dWallets:
//   Secp256k1 (curve 0)  → controls Bitcoin + Ethereum (ECDSA)
//   Curve25519 (curve 2) → controls Solana (EdDSA)
#[allow(dead_code)]
const CURVE_SECP256K1: u8 = 0;  // BTC + ETH
#[allow(dead_code)]
const CURVE_SECP256R1: u8 = 1;  // WebAuthn (future)
#[allow(dead_code)]
const CURVE_25519: u8 = 2;      // SOL
#[allow(dead_code)]
const CURVE_RISTRETTO: u8 = 3;  // Substrate (future)

// ─── Ika signature schemes ───
const SIG_ED25519: u8 = 0;      // Solana, Sui
const SIG_SECP256K1: u8 = 1;    // Bitcoin, Ethereum
const SIG_SECP256R1: u8 = 2;    // WebAuthn / P-256 (Ika docs)

pub fn process_instruction(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    match instruction_data[0] {
        INIT_HOLLOW => init_hollow(program_id, accounts, &instruction_data[1..]),
        APPROVE_ACTION => approve_action(program_id, accounts, &instruction_data[1..]),
        TRANSFER_AUTHORITY => transfer_authority(program_id, accounts, &instruction_data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// Build the DWalletContext from a standard set of accounts.
fn build_ctx<'a>(
    program_id: &Address,
    dwallet_program: &'a AccountView,
    cpi_authority: &'a AccountView,
    caller_program: &'a AccountView,
) -> Result<(DWalletContext<'a>, Address, u8), ProgramError> {
    let (expected_cpi, bump) = Address::derive_program_address(&[CPI_AUTHORITY_SEED], program_id)
        .ok_or(ProgramError::InvalidAccountData)?;

    if *cpi_authority.address() != expected_cpi {
        return Err(ProgramError::InvalidAccountData);
    }

    let ctx = DWalletContext {
        dwallet_program,
        cpi_authority,
        caller_program,
        cpi_authority_bump: bump,
    };

    Ok((ctx, expected_cpi, bump))
}

/// Initialize a Hollow identity by transferring TWO dWallet authorities
/// to this program's CPI authority PDA.
///
/// A Hollow consists of:
///   - A Secp256k1 dWallet (BTC + ETH)
///   - A Curve25519 dWallet (SOL)
///
/// Both must have their authority transferred to The Hollow's CPI PDA
/// so only this program can approve cross-chain signatures.
///
/// Accounts:
///   0. [signer]   owner              - the dWallet creator
///   1. [writable] dwallet_secp256k1  - Secp256k1 dWallet (BTC/ETH)
///   2. [writable] dwallet_curve25519 - Curve25519 dWallet (SOL)
///   3. []         dwallet_program    - Ika dWallet program
///   4. []         cpi_authority      - this program's CPI authority PDA
///   5. []         caller_program     - this program's executable account
fn init_hollow(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    if accounts.len() < 6 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let owner = &accounts[0];
    let dwallet_secp = &accounts[1];
    let dwallet_ed = &accounts[2];
    let dwallet_program = &accounts[3];
    let cpi_authority = &accounts[4];
    let caller_program = &accounts[5];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (ctx, expected_cpi, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;

    // Transfer authority for the Secp256k1 dWallet (Bitcoin + Ethereum)
    ctx.transfer_dwallet(dwallet_secp, expected_cpi.to_bytes())?;

    // Transfer authority for the Curve25519 dWallet (Solana)
    ctx.transfer_dwallet(dwallet_ed, expected_cpi.to_bytes())?;

    Ok(())
}

/// Approve a cross-chain message for Ika MPC signing.
///
/// The caller specifies which dWallet to sign with (secp256k1 for BTC/ETH,
/// curve25519 for SOL) and the appropriate signature scheme.
///
/// After this call, a MessageApproval PDA is created on-chain:
///   Seeds: ["message_approval", dwallet_pubkey, message_hash]
///   Program: DWALLET_PROGRAM_ID
///
/// The Ika network detects the PDA, runs 2PC-MPC signing, and writes the
/// signature back to the account (status changes from Pending(0) to Signed(1)).
///
/// Accounts:
///   0. [signer]   owner            - the Hollow owner
///   1. [writable] message_approval - PDA to create
///   2. []         dwallet          - which dWallet to sign with
///   3. [signer]   payer            - rent payer for PDA creation
///   4. []         system_program
///   5. []         dwallet_program
///   6. []         cpi_authority
///   7. []         caller_program
///
/// Data layout:
///   [0..32]  message_hash      - keccak256(message) per Ika MessageApproval docs
///   [32..64] user_pubkey       - 32-byte public key for the target chain
///   [64]     signature_scheme  - 0=Ed25519, 1=Secp256k1, 2=Secp256r1 (Ika)
///   [65]     bump              - MessageApproval PDA bump
fn approve_action(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 66 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let owner = &accounts[0];
    let message_approval = &accounts[1];
    let dwallet = &accounts[2];
    let payer = &accounts[3];
    let system_program = &accounts[4];
    let dwallet_program = &accounts[5];
    let cpi_authority = &accounts[6];
    let caller_program = &accounts[7];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (ctx, _, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;

    let mut message_hash = [0u8; 32];
    message_hash.copy_from_slice(&data[0..32]);

    let mut user_pubkey = [0u8; 32];
    user_pubkey.copy_from_slice(&data[32..64]);

    let signature_scheme = data[64];
    let bump = data[65];

    match signature_scheme {
        SIG_ED25519 | SIG_SECP256K1 | SIG_SECP256R1 => {}
        _ => return Err(ProgramError::InvalidInstructionData),
    }

    ctx.approve_message(
        message_approval,
        dwallet,
        payer,
        system_program,
        message_hash,
        user_pubkey,
        signature_scheme,
        bump,
    )?;

    Ok(())
}

/// Transfer a dWallet's authority to a new address.
///
/// Use cases: recovery, DAO handoff, or revoking program control.
///
/// Accounts:
///   0. [signer]   owner
///   1. [writable] dwallet
///   2. []         dwallet_program
///   3. []         cpi_authority
///   4. []         caller_program
///
/// Data:
///   [0..32] new_authority pubkey
fn transfer_authority(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 32 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let owner = &accounts[0];
    let dwallet = &accounts[1];
    let dwallet_program = &accounts[2];
    let cpi_authority = &accounts[3];
    let caller_program = &accounts[4];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (ctx, _, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;

    let mut new_authority = [0u8; 32];
    new_authority.copy_from_slice(&data[0..32]);
    ctx.transfer_dwallet(dwallet, new_authority)?;

    Ok(())
}
