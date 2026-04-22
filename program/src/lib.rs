#![no_std]
//! On-chain **PRISM** controller: Ika dWallet `approve_message` CPI, optional Encrypt-gated approval, sovereign PDAs.
//!
//! Aligns with the [Ika dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/print.html). CPI authority PDA uses
//! `ika_dwallet_pinocchio::CPI_AUTHORITY_SEED` (`__ika_cpi_authority`).
extern crate alloc;

use ika_dwallet_pinocchio::{CPI_AUTHORITY_SEED, DWalletContext};
use pinocchio::{
    cpi::{Seed, Signer},
    entrypoint, error::ProgramError, sysvars::clock::Clock, sysvars::rent::RENT_ID, AccountView,
    Address, ProgramResult,
};
use pinocchio_system::{create_account_with_minimum_balance_signed, ID as SYSTEM_PROGRAM_ID};

entrypoint!(process_instruction);
pinocchio::nostd_panic_handler!();

/// Deployed **PRISM** controller program id. After `solana program deploy`, set this to match (see Ika quick-start `Address::from_str_const`).
pub const ID: Address = Address::new_from_array([0u8; 32]);

// ─── Instruction discriminators ───
const INIT_PRISM: u8 = 0;
const APPROVE_ACTION: u8 = 1;
const TRANSFER_AUTHORITY: u8 = 2;
/// Create PDA `["prism_policy", owner, message_hash]` — stores eligibility byte (Encrypt gate placeholder).
const INIT_ENCRYPT_POLICY_GATE: u8 = 3;
/// Set eligibility (0/1). Demo: PRISM owner sets `1` after Encrypt graph says “allow sign”. Production: restrict who can set this.
const SET_ENCRYPT_POLICY_ELIGIBLE: u8 = 4;
/// Same as `approve_action` but requires policy PDA data[0] == 1 (Encrypt satisfied).
const APPROVE_ACTION_GATED: u8 = 5;

/// PDA `["prism_sovereign", owner]` — dead-man + balance-shield config (devnet; plaintext fields — Encrypt can hide thresholds in production).
const INIT_SOVEREIGN: u8 = 6;
const POKE_SOVEREIGN: u8 = 7;
/// Owner-signed demo “oracle”: updates `last_attested_native` (sats / lamports / abstract units) for the panic-shield check.
const ATTEST_BALANCE: u8 = 8;
const SET_ARMED: u8 = 9;
/// Permissionless: if armed and inactivity window exceeded, transfer both dWallets to recovery.
const SPRING_INACTIVITY: u8 = 10;
/// Permissionless: if armed and `last_attested_native < panic_floor`, transfer to recovery.
const SPRING_PANIC: u8 = 11;

// ─── Ika dWallet curves ───
#[allow(dead_code)]
const CURVE_SECP256K1: u8 = 0; // BTC + ETH
#[allow(dead_code)]
const CURVE_SECP256R1: u8 = 1;
#[allow(dead_code)]
const CURVE_25519: u8 = 2; // SOL
#[allow(dead_code)]
const CURVE_RISTRETTO: u8 = 3;

// ─── Encrypt policy gate (placeholder for Encrypt ciphertext / graph result) ───
const PRISM_POLICY_SEED: &[u8] = b"prism_policy";
const POLICY_GATE_LEN: usize = 1;

// ─── Sovereign command center state ───
const SOVEREIGN_SEED: &[u8] = b"prism_sovereign";
const SOVEREIGN_VERSION: u8 = 1;
/// Layout: v(1) | is_armed(1) | tripped(1) | pad(5) | owner(32) | recovery(32) | u64×4
const SOVEREIGN_STATE_LEN: usize = 104;
const TRIPPED_NONE: u8 = 0;
const TRIPPED_INACTIVITY: u8 = 1;
const TRIPPED_PANIC: u8 = 2;

pub fn process_instruction(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    match instruction_data[0] {
        INIT_PRISM => init_prism(program_id, accounts, &instruction_data[1..]),
        APPROVE_ACTION => approve_action(program_id, accounts, &instruction_data[1..]),
        TRANSFER_AUTHORITY => transfer_authority(program_id, accounts, &instruction_data[1..]),
        INIT_ENCRYPT_POLICY_GATE => init_encrypt_policy_gate(program_id, accounts, &instruction_data[1..]),
        SET_ENCRYPT_POLICY_ELIGIBLE => set_encrypt_policy_eligible(program_id, accounts, &instruction_data[1..]),
        APPROVE_ACTION_GATED => approve_action_gated(program_id, accounts, &instruction_data[1..]),
        INIT_SOVEREIGN => init_sovereign(program_id, accounts, &instruction_data[1..]),
        POKE_SOVEREIGN => poke_sovereign(program_id, accounts, &instruction_data[1..]),
        ATTEST_BALANCE => attest_balance(program_id, accounts, &instruction_data[1..]),
        SET_ARMED => set_armed(program_id, accounts, &instruction_data[1..]),
        SPRING_INACTIVITY => spring_inactivity(program_id, accounts, &instruction_data[1..]),
        SPRING_PANIC => spring_panic(program_id, accounts, &instruction_data[1..]),
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

fn derive_policy_pda(
    program_id: &Address,
    owner: &AccountView,
    message_hash: &[u8; 32],
) -> Result<(Address, u8), ProgramError> {
    let seeds: &[&[u8]; 3] = &[PRISM_POLICY_SEED, owner.address().as_ref(), message_hash];
    Address::derive_program_address(seeds, program_id).ok_or(ProgramError::InvalidSeeds)
}

fn derive_sovereign_pda(
    program_id: &Address,
    owner: &AccountView,
) -> Result<(Address, u8), ProgramError> {
    let seeds: &[&[u8]; 2] = &[SOVEREIGN_SEED, owner.address().as_ref()];
    Address::derive_program_address(seeds, program_id).ok_or(ProgramError::InvalidSeeds)
}

/// Read clock sysvar; must be the Clock sysvar account.
fn read_clock_slot(clock: &AccountView) -> Result<u64, ProgramError> {
    let c = Clock::from_account_view(clock)?;
    Ok(c.slot)
}

fn read_sovereign_data(data: &[u8]) -> Result<&[u8], ProgramError> {
    if data.len() < SOVEREIGN_STATE_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(&data[0..SOVEREIGN_STATE_LEN])
}

fn pack_sovereign(
    out: &mut [u8],
    owner: &[u8; 32],
    recovery: &[u8; 32],
    last_heartbeat: u64,
    inactivity_limit: u64,
    panic_floor: u64,
    last_attested: u64,
    is_armed: u8,
    tripped: u8,
) {
    out[0] = SOVEREIGN_VERSION;
    out[1] = is_armed;
    out[2] = tripped;
    out[3..8].fill(0);
    out[8..40].copy_from_slice(owner);
    out[40..72].copy_from_slice(recovery);
    out[72..80].copy_from_slice(&last_heartbeat.to_le_bytes());
    out[80..88].copy_from_slice(&inactivity_limit.to_le_bytes());
    out[88..96].copy_from_slice(&panic_floor.to_le_bytes());
    out[96..104].copy_from_slice(&last_attested.to_le_bytes());
}

/// Data after discriminator: `recovery` [32] | `inactivity_limit_slots` u64 LE | `panic_floor` u64 LE | `is_armed` u8
///
/// Accounts: 0 [signer] owner, 1 [writable] sovereign PDA, 2 [signer] payer, 3 rent, 4 system, 5 clock
fn init_sovereign(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 6 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 49 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let owner = &accounts[0];
    let sovereign = &accounts[1];
    let payer = &accounts[2];
    let rent_sysvar = &accounts[3];
    let system_program = &accounts[4];
    let clock = &accounts[5];

    if !owner.is_signer() || !payer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if rent_sysvar.address() != &RENT_ID {
        return Err(ProgramError::UnsupportedSysvar);
    }
    if system_program.address() != &SYSTEM_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }

    let (expected, bump) = derive_sovereign_pda(program_id, owner)?;
    if sovereign.address() != &expected {
        return Err(ProgramError::InvalidAccountData);
    }
    if sovereign.data_len() >= SOVEREIGN_STATE_LEN {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let mut recovery = [0u8; 32];
    recovery.copy_from_slice(&data[0..32]);
    let inactivity_limit = u64::from_le_bytes(
        data[32..40]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let panic_floor = u64::from_le_bytes(
        data[40..48]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let is_armed = data[48];
    if is_armed > 1 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let now_slot = read_clock_slot(clock)?;
    let mut owner_bytes = [0u8; 32];
    owner_bytes.copy_from_slice(owner.address().as_ref());

    let bump_seed = [bump];
    let seed_seeds = [
        Seed::from(SOVEREIGN_SEED),
        Seed::from(owner.address().as_ref()),
        Seed::from(&bump_seed[..]),
    ];
    let signer = Signer::from(&seed_seeds);

    create_account_with_minimum_balance_signed(
        sovereign,
        SOVEREIGN_STATE_LEN,
        program_id,
        payer,
        Some(rent_sysvar),
        core::slice::from_ref(&signer),
    )?;

    let mut pd = sovereign.try_borrow_mut()?;
    if pd.len() < SOVEREIGN_STATE_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    pack_sovereign(
        &mut pd[0..SOVEREIGN_STATE_LEN],
        &owner_bytes,
        &recovery,
        now_slot,
        inactivity_limit,
        panic_floor,
        0, // last_attested
        is_armed,
        TRIPPED_NONE,
    );
    Ok(())
}

/// Data: (none)
/// Accounts: 0 [signer] owner, 1 [writable] sovereign, 2 [] clock
fn poke_sovereign(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let owner = &accounts[0];
    let sovereign = &accounts[1];
    let clock = &accounts[2];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (expected, _) = derive_sovereign_pda(program_id, owner)?;
    if sovereign.address() != &expected {
        return Err(ProgramError::InvalidAccountData);
    }
    if !sovereign.owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let now_slot = read_clock_slot(clock)?;
    {
        let mut pd = sovereign.try_borrow_mut()?;
        let s = read_sovereign_data(&pd)?;
        if s[0] != SOVEREIGN_VERSION {
            return Err(ProgramError::InvalidAccountData);
        }
        if s[1] == 0 {
            return Err(ProgramError::InvalidArgument);
        } // not armed
        if s[2] != TRIPPED_NONE {
            return Err(ProgramError::InvalidArgument);
        } // must reset via set_armed after tripped
        if s[8..40] != *owner.address().as_ref() {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut owner_a = [0u8; 32];
        owner_a.copy_from_slice(&s[8..40]);
        let mut recovery = [0u8; 32];
        recovery.copy_from_slice(&s[40..72]);
        let inactivity = u64::from_le_bytes(s[80..88].try_into().unwrap());
        let panic_floor = u64::from_le_bytes(s[88..96].try_into().unwrap());
        let last_a = u64::from_le_bytes(s[96..104].try_into().unwrap());
        let is_armed = s[1];

        pack_sovereign(
            &mut pd[0..SOVEREIGN_STATE_LEN],
            &owner_a,
            &recovery,
            now_slot,
            inactivity,
            panic_floor,
            last_a,
            is_armed,
            TRIPPED_NONE,
        );
    }
    Ok(())
}

/// Data: `last_attested_native` u64 LE
fn attest_balance(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let owner = &accounts[0];
    let sovereign = &accounts[1];
    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (expected, _) = derive_sovereign_pda(program_id, owner)?;
    if sovereign.address() != &expected {
        return Err(ProgramError::InvalidAccountData);
    }
    if !sovereign.owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let last_attested = u64::from_le_bytes(data[0..8].try_into().unwrap());
    {
        let mut pd = sovereign.try_borrow_mut()?;
        let s = read_sovereign_data(&pd)?;
        if s[0] != SOVEREIGN_VERSION || s[8..40] != *owner.address().as_ref() {
            return Err(ProgramError::InvalidAccountData);
        }
        if s[2] != TRIPPED_NONE {
            return Err(ProgramError::InvalidArgument);
        }

        let last_h = u64::from_le_bytes(s[72..80].try_into().unwrap());
        let inactivity = u64::from_le_bytes(s[80..88].try_into().unwrap());
        let panic_floor = u64::from_le_bytes(s[88..96].try_into().unwrap());
        let is_armed = s[1];
        let tripped = s[2];
        let mut owner_a = [0u8; 32];
        owner_a.copy_from_slice(&s[8..40]);
        let mut recovery = [0u8; 32];
        recovery.copy_from_slice(&s[40..72]);
        pack_sovereign(
            &mut pd[0..SOVEREIGN_STATE_LEN],
            &owner_a,
            &recovery,
            last_h,
            inactivity,
            panic_floor,
            last_attested,
            is_armed,
            tripped,
        );
    }
    Ok(())
}

/// Data: `is_armed` u8 (0/1) — re-arm after addressing a trip or pause traps.
fn set_armed(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    let is_armed = data[0];
    if is_armed > 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let owner = &accounts[0];
    let sovereign = &accounts[1];
    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (expected, _) = derive_sovereign_pda(program_id, owner)?;
    if sovereign.address() != &expected {
        return Err(ProgramError::InvalidAccountData);
    }
    {
        let mut pd = sovereign.try_borrow_mut()?;
        let s = read_sovereign_data(&pd)?;
        if s[0] != SOVEREIGN_VERSION || s[8..40] != *owner.address().as_ref() {
            return Err(ProgramError::InvalidAccountData);
        }
        let last_h = u64::from_le_bytes(s[72..80].try_into().unwrap());
        let inactivity = u64::from_le_bytes(s[80..88].try_into().unwrap());
        let panic_floor = u64::from_le_bytes(s[88..96].try_into().unwrap());
        let last_a = u64::from_le_bytes(s[96..104].try_into().unwrap());
        let mut owner_a = [0u8; 32];
        owner_a.copy_from_slice(&s[8..40]);
        let mut recovery = [0u8; 32];
        recovery.copy_from_slice(&s[40..72]);
        let tripped = if is_armed == 1 { TRIPPED_NONE } else { s[2] };
        pack_sovereign(
            &mut pd[0..SOVEREIGN_STATE_LEN],
            &owner_a,
            &recovery,
            last_h,
            inactivity,
            panic_floor,
            last_a,
            is_armed,
            tripped,
        );
    }
    Ok(())
}

/// Permissionless. Accounts: 0 [writable] sovereign, 1 clock, 2 [writable] dwallet_secp, 3 [writable] dwallet_ed, 4 dwallet_program, 5 cpi_authority, 6 caller_program
fn spring_inactivity(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    if accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let sovereign = &accounts[0];
    let clock = &accounts[1];
    let dwallet_secp = &accounts[2];
    let dwallet_ed = &accounts[3];
    let dwallet_program = &accounts[4];
    let cpi_authority = &accounts[5];
    let caller_program = &accounts[6];

    if !sovereign.owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let now_slot = read_clock_slot(clock)?;
    let mut recovery = [0u8; 32];
    let owner_pk = {
        let sd = sovereign.try_borrow()?;
        let s = read_sovereign_data(&sd)?;
        if s[0] != SOVEREIGN_VERSION {
            return Err(ProgramError::InvalidAccountData);
        }
        if s[1] == 0 {
            return Err(ProgramError::InvalidArgument);
        } // not armed
        if s[2] != TRIPPED_NONE {
            return Err(ProgramError::InvalidArgument);
        }
        let last_h = u64::from_le_bytes(s[72..80].try_into().unwrap());
        let inactivity = u64::from_le_bytes(s[80..88].try_into().unwrap());
        if inactivity == 0 {
            return Err(ProgramError::InvalidArgument);
        }
        if now_slot <= last_h.saturating_add(inactivity) {
            return Err(ProgramError::InvalidArgument);
        } // not expired
        let mut o = [0u8; 32];
        o.copy_from_slice(&s[8..40]);
        recovery.copy_from_slice(&s[40..72]);
        o
    };
    {
        let (exp_pda, _) = Address::derive_program_address(
            &[SOVEREIGN_SEED, owner_pk.as_ref()],
            program_id,
        )
        .ok_or(ProgramError::InvalidSeeds)?;
        if sovereign.address() != &exp_pda {
            return Err(ProgramError::InvalidAccountData);
        }
    }

    let (ctx, _, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;
    ctx.transfer_dwallet(dwallet_secp, recovery)?;
    ctx.transfer_dwallet(dwallet_ed, recovery)?;

    {
        let mut pd = sovereign.try_borrow_mut()?;
        let s = read_sovereign_data(&pd)?;
        let last_h = u64::from_le_bytes(s[72..80].try_into().unwrap());
        let inactivity = u64::from_le_bytes(s[80..88].try_into().unwrap());
        let panic_floor = u64::from_le_bytes(s[88..96].try_into().unwrap());
        let last_a = u64::from_le_bytes(s[96..104].try_into().unwrap());
        let mut oa = [0u8; 32];
        oa.copy_from_slice(&s[8..40]);
        let mut rec = [0u8; 32];
        rec.copy_from_slice(&s[40..72]);
        pack_sovereign(
            &mut pd[0..SOVEREIGN_STATE_LEN],
            &oa,
            &rec,
            last_h,
            inactivity,
            panic_floor,
            last_a,
            0,                 // disarm
            TRIPPED_INACTIVITY,
        );
    }
    Ok(())
}

/// Permissionless. Same account order as `spring_inactivity`. Panic: `0 < last_attested < panic_floor` (e.g. balance fell below your floor in demo units).
fn spring_panic(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    if accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let sovereign = &accounts[0];
    let _clock = &accounts[1];
    let dwallet_secp = &accounts[2];
    let dwallet_ed = &accounts[3];
    let dwallet_program = &accounts[4];
    let cpi_authority = &accounts[5];
    let caller_program = &accounts[6];

    if !sovereign.owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut recovery = [0u8; 32];
    let mut owner_pk = [0u8; 32];
    {
        let sd = sovereign.try_borrow()?;
        let s = read_sovereign_data(&sd)?;
        if s[0] != SOVEREIGN_VERSION {
            return Err(ProgramError::InvalidAccountData);
        }
        if s[1] == 0 {
            return Err(ProgramError::InvalidArgument);
        }
        if s[2] != TRIPPED_NONE {
            return Err(ProgramError::InvalidArgument);
        }
        let panic_floor = u64::from_le_bytes(s[88..96].try_into().unwrap());
        let last_a = u64::from_le_bytes(s[96..104].try_into().unwrap());
        if panic_floor == 0 {
            return Err(ProgramError::InvalidArgument);
        }
        if last_a == 0 {
            return Err(ProgramError::InvalidArgument);
        } // need at least one attestation
        if last_a >= panic_floor {
            return Err(ProgramError::InvalidArgument);
        } // still above / equal floor: no panic
        owner_pk.copy_from_slice(&s[8..40]);
        recovery.copy_from_slice(&s[40..72]);
    }
    {
        let (exp_pda, _) = Address::derive_program_address(
            &[SOVEREIGN_SEED, owner_pk.as_ref()],
            program_id,
        )
        .ok_or(ProgramError::InvalidSeeds)?;
        if sovereign.address() != &exp_pda {
            return Err(ProgramError::InvalidAccountData);
        }
    }

    let (ctx, _, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;
    ctx.transfer_dwallet(dwallet_secp, recovery)?;
    ctx.transfer_dwallet(dwallet_ed, recovery)?;

    {
        let mut pd = sovereign.try_borrow_mut()?;
        let s = read_sovereign_data(&pd)?;
        let last_h = u64::from_le_bytes(s[72..80].try_into().unwrap());
        let inactivity = u64::from_le_bytes(s[80..88].try_into().unwrap());
        let panic_floor = u64::from_le_bytes(s[88..96].try_into().unwrap());
        let last_a = u64::from_le_bytes(s[96..104].try_into().unwrap());
        let mut oa = [0u8; 32];
        oa.copy_from_slice(&s[8..40]);
        let mut rec = [0u8; 32];
        rec.copy_from_slice(&s[40..72]);
        pack_sovereign(
            &mut pd[0..SOVEREIGN_STATE_LEN],
            &oa,
            &rec,
            last_h,
            inactivity,
            panic_floor,
            last_a,
            0,
            TRIPPED_PANIC,
        );
    }
    Ok(())
}

/// Initialize PRISM control by transferring TWO dWallet authorities
/// to this program's CPI authority PDA.
///
/// Accounts:
///   0. [signer]   owner
///   1. [writable] dwallet_secp256k1
///   2. [writable] dwallet_curve25519
///   3. []         dwallet_program
///   4. []         cpi_authority
///   5. []         caller_program
fn init_prism(
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

    ctx.transfer_dwallet(dwallet_secp, expected_cpi.to_bytes())?;
    ctx.transfer_dwallet(dwallet_ed, expected_cpi.to_bytes())?;

    Ok(())
}

/// Approve a cross-chain message for Ika MPC signing.
///
/// Accounts:
///   0. [signer]   owner
///   1. []         DWalletCoordinator PDA (`dwallet_coordinator` on Ika program)
///   2. [writable] message_approval (PDA to create)
///   3. []         dwallet
///   4. [signer]   payer
///   5. []         system program
///   6. []         Ika dWallet program
///   7. []         PRISM CPI authority PDA
///   8. []         PRISM program (caller)
///
/// Data layout (matches `ika-dwallet-pinocchio` CPI):
///   [0..32]   message_digest (message hash)
///   [32..64]  message_metadata_digest (often zeros)
///   [64..96]  user_pubkey
///   [96..98]  signature_scheme (u16 LE; 0 / 1 / 2 for Ed25519 / Secp256k1 / Secp256r1)
///   [98]      message_approval bump
fn approve_action(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 9 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 99 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let owner = &accounts[0];
    let coordinator = &accounts[1];
    let message_approval = &accounts[2];
    let dwallet = &accounts[3];
    let payer = &accounts[4];
    let system_program = &accounts[5];
    let dwallet_program = &accounts[6];
    let cpi_authority = &accounts[7];
    let caller_program = &accounts[8];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (ctx, _, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;

    let mut message_digest = [0u8; 32];
    message_digest.copy_from_slice(&data[0..32]);

    let mut message_metadata_digest = [0u8; 32];
    message_metadata_digest.copy_from_slice(&data[32..64]);

    let mut user_pubkey = [0u8; 32];
    user_pubkey.copy_from_slice(&data[64..96]);

    let signature_scheme = u16::from_le_bytes([data[96], data[97]]);
    let bump = data[98];

    // `DWalletSignatureScheme` (ika-dwallet-types): 0–6 on current pre-alpha.
    if signature_scheme > 6 {
        return Err(ProgramError::InvalidInstructionData);
    }

    ctx.approve_message(
        coordinator,
        message_approval,
        dwallet,
        payer,
        system_program,
        message_digest,
        message_metadata_digest,
        user_pubkey,
        signature_scheme,
        bump,
    )?;

    Ok(())
}

/// Create the Encrypt policy gate PDA (1 byte: eligible flag).
///
/// In production, eligibility is set by the Encrypt executor or a verified CPI
/// after `execute_graph`; this instruction only allocates the slot.
///
/// Accounts:
///   0. [signer]   owner (same pubkey as in PDA seeds)
///   1. [writable] policy_pda
///   2. [signer]   payer (rent)
///   3. []         rent sysvar
///   4. []         system program
///
/// Data: `message_hash` [32]
fn init_encrypt_policy_gate(
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
    let policy_pda = &accounts[1];
    let payer = &accounts[2];
    let rent_sysvar = &accounts[3];
    let system_program = &accounts[4];

    if !owner.is_signer() || !payer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    if rent_sysvar.address() != &RENT_ID {
        return Err(ProgramError::UnsupportedSysvar);
    }
    if system_program.address() != &SYSTEM_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut message_hash = [0u8; 32];
    message_hash.copy_from_slice(&data[0..32]);

    let (expected_pda, bump) = derive_policy_pda(program_id, owner, &message_hash)?;
    if policy_pda.address() != &expected_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    if policy_pda.data_len() >= POLICY_GATE_LEN {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let bump_seed = [bump];
    let seed_seeds = [
        Seed::from(PRISM_POLICY_SEED),
        Seed::from(owner.address().as_ref()),
        Seed::from(&message_hash[..]),
        Seed::from(&bump_seed[..]),
    ];
    let signer = Signer::from(&seed_seeds);

    create_account_with_minimum_balance_signed(
        policy_pda,
        POLICY_GATE_LEN,
        program_id,
        payer,
        Some(rent_sysvar),
        core::slice::from_ref(&signer),
    )?;

    let mut pd = policy_pda.try_borrow_mut()?;
    if pd.len() < POLICY_GATE_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    pd[0] = 0; // not eligible until Encrypt / demo sets it

    Ok(())
}

/// Set policy eligibility (0 = deny, 1 = allow signing).
///
/// Accounts:
///   0. [signer]   owner (must match PDA seed)
///   1. [writable] policy_pda
///
/// Data: `message_hash` [32] | `eligible` [1]
fn set_encrypt_policy_eligible(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 33 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let owner = &accounts[0];
    let policy_pda = &accounts[1];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut message_hash = [0u8; 32];
    message_hash.copy_from_slice(&data[0..32]);
    let eligible = data[32];
    if eligible > 1 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let (expected_pda, _) = derive_policy_pda(program_id, owner, &message_hash)?;
    if policy_pda.address() != &expected_pda {
        return Err(ProgramError::InvalidAccountData);
    }
    if !policy_pda.owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut pd = policy_pda.try_borrow_mut()?;
    if pd.len() < POLICY_GATE_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    pd[0] = eligible;

    Ok(())
}

/// Approve Ika message only if Encrypt policy gate is open for this `message_hash`.
///
/// Accounts: same as `approve_action` plus:
///   9. []         policy_pda (must be owned by this program; data[0] == 1)
///
/// Data: same 99 bytes as `approve_action`.
fn approve_action_gated(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 10 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 99 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let owner = &accounts[0];
    let coordinator = &accounts[1];
    let message_approval = &accounts[2];
    let dwallet = &accounts[3];
    let payer = &accounts[4];
    let system_program = &accounts[5];
    let dwallet_program = &accounts[6];
    let cpi_authority = &accounts[7];
    let caller_program = &accounts[8];
    let policy_pda = &accounts[9];

    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut message_digest = [0u8; 32];
    message_digest.copy_from_slice(&data[0..32]);

    let (expected_policy, _) = derive_policy_pda(program_id, owner, &message_digest)?;
    if policy_pda.address() != &expected_policy {
        return Err(ProgramError::InvalidAccountData);
    }
    if !policy_pda.owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    {
        let pol = policy_pda.try_borrow()?;
        if pol.len() < 1 || pol[0] != 1 {
            return Err(ProgramError::InvalidArgument);
        }
    }

    let (ctx, _, _) = build_ctx(
        program_id, dwallet_program, cpi_authority, caller_program,
    )?;

    let mut message_metadata_digest = [0u8; 32];
    message_metadata_digest.copy_from_slice(&data[32..64]);

    let mut user_pubkey = [0u8; 32];
    user_pubkey.copy_from_slice(&data[64..96]);

    let signature_scheme = u16::from_le_bytes([data[96], data[97]]);
    let bump = data[98];

    if signature_scheme > 6 {
        return Err(ProgramError::InvalidInstructionData);
    }

    ctx.approve_message(
        coordinator,
        message_approval,
        dwallet,
        payer,
        system_program,
        message_digest,
        message_metadata_digest,
        user_pubkey,
        signature_scheme,
        bump,
    )?;

    Ok(())
}

/// Transfer a dWallet's authority to a new address.
///
/// Data: [0..32] new_authority pubkey
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
