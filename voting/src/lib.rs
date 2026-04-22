#![no_std]
//! Example `prism-voting` program — dWallet + message-hash patterns on Solana, separate from the main PRISM controller.
//! For Ika dWallet flow details see `program/src/lib.rs` and the [Ika book](https://solana-pre-alpha.ika.xyz/print.html).
extern crate alloc;

use ika_dwallet_pinocchio::{CPI_AUTHORITY_SEED, DWalletContext};
use pinocchio::{entrypoint, error::ProgramError, AccountView, Address, ProgramResult};

entrypoint!(process_instruction);
pinocchio::nostd_panic_handler!();

/// Your deployed voting program id (`Address::from_str_const` after deploy). Distinct from the Ika dWallet program.
pub const ID: Address = Address::new_from_array([9u8; 32]);

const CREATE_PROPOSAL: u8 = 0;
const CAST_VOTE: u8 = 1;

const STATUS_PENDING: u8 = 0;
const STATUS_APPROVED: u8 = 1;

const VOTE_NO: u8 = 0;
const VOTE_YES: u8 = 1;

// Proposal account fixed layout (117 bytes)
// [0..32]   creator
// [32..64]  dwallet
// [64..96]  message_hash
// [96..104] yes_votes (u64 LE)
// [104..112] no_votes (u64 LE)
// [112]     quorum (u8)
// [113..115] signature_scheme (u16 LE; UserSignature scheme id)
// [115]     status (u8)
// [116]     approved_bump (u8)
const PROPOSAL_LEN: usize = 117;

// Vote record fixed layout (33 bytes)
// [0..32] voter pubkey
// [32]    vote value (0/1)
const VOTE_RECORD_LEN: usize = 33;

fn read_u64_le(bytes: &[u8]) -> u64 {
    let mut arr = [0u8; 8];
    arr.copy_from_slice(bytes);
    u64::from_le_bytes(arr)
}

fn write_u64_le(dst: &mut [u8], value: u64) {
    dst.copy_from_slice(&value.to_le_bytes());
}

fn build_ctx<'a>(
    program_id: &Address,
    dwallet_program: &'a AccountView,
    cpi_authority: &'a AccountView,
    caller_program: &'a AccountView,
) -> Result<(DWalletContext<'a>, u8), ProgramError> {
    let (expected_cpi, bump) = Address::derive_program_address(&[CPI_AUTHORITY_SEED], program_id)
        .ok_or(ProgramError::InvalidAccountData)?;
    if *cpi_authority.address() != expected_cpi {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok((
        DWalletContext {
            dwallet_program,
            cpi_authority,
            caller_program,
            cpi_authority_bump: bump,
        },
        bump,
    ))
}

pub fn process_instruction(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    match instruction_data[0] {
        CREATE_PROPOSAL => create_proposal(program_id, accounts, &instruction_data[1..]),
        CAST_VOTE => cast_vote(program_id, accounts, &instruction_data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// create_proposal (discriminator = 0)
///
/// Accounts:
/// 0. [signer]   creator
/// 1. [writable] proposal PDA
/// 2. []         dwallet account
///
/// Data:
/// [0..32] message_hash
/// [32]    quorum (u8)
/// [33..35] signature_scheme (u16 LE; `DWalletSignatureScheme` 0–6 per ika-dwallet-types)
/// [35]    approved_bump (message approval PDA bump)
fn create_proposal(
    _program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 36 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let creator = &accounts[0];
    let proposal = &accounts[1];
    let dwallet = &accounts[2];

    if !creator.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let message_hash = &data[0..32];
    let quorum = data[32];
    let signature_scheme = u16::from_le_bytes([data[33], data[34]]);
    let approved_bump = data[35];

    if signature_scheme > 6 {
        return Err(ProgramError::InvalidInstructionData);
    }
    if quorum == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut proposal_data = proposal.try_borrow_mut()?;
    if proposal_data.len() < PROPOSAL_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Initialize proposal
    proposal_data[0..32].copy_from_slice(creator.address().as_ref());
    proposal_data[32..64].copy_from_slice(dwallet.address().as_ref());
    proposal_data[64..96].copy_from_slice(message_hash);
    write_u64_le(&mut proposal_data[96..104], 0);
    write_u64_le(&mut proposal_data[104..112], 0);
    proposal_data[112] = quorum;
    proposal_data[113..115].copy_from_slice(&signature_scheme.to_le_bytes());
    proposal_data[115] = STATUS_PENDING;
    proposal_data[116] = approved_bump;

    Ok(())
}

/// cast_vote (discriminator = 1)
///
/// Accounts:
/// 0. [signer]   voter
/// 1. [writable] proposal PDA
/// 2. [writable] vote_record PDA (created once per voter+proposal)
/// 3. []         DWalletCoordinator PDA
/// 4. [writable] message_approval PDA
/// 5. []         dwallet account
/// 6. [signer]   payer
/// 7. []         system_program
/// 8. []         dwallet_program
/// 9. []         cpi_authority PDA
/// 10. []        caller_program (this program)
///
/// Data:
/// [0] vote_value (0 no, 1 yes)
/// [1..33] user_pubkey (target chain pubkey bytes)
fn cast_vote(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 11 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 33 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let voter = &accounts[0];
    let proposal = &accounts[1];
    let vote_record = &accounts[2];
    let coordinator = &accounts[3];
    let message_approval = &accounts[4];
    let dwallet = &accounts[5];
    let payer = &accounts[6];
    let system_program = &accounts[7];
    let dwallet_program = &accounts[8];
    let cpi_authority = &accounts[9];
    let caller_program = &accounts[10];

    if !voter.is_signer() || !payer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let vote_value = data[0];
    if vote_value != VOTE_NO && vote_value != VOTE_YES {
        return Err(ProgramError::InvalidInstructionData);
    }
    // Prevent double voting by checking vote record initialization
    {
        let mut vr_data = vote_record.try_borrow_mut()?;
        if vr_data.len() < VOTE_RECORD_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let already_voted = vr_data[0..32].iter().any(|b| *b != 0);
        if already_voted {
            return Err(ProgramError::AccountAlreadyInitialized);
        }
        vr_data[0..32].copy_from_slice(voter.address().as_ref());
        vr_data[32] = vote_value;
    }

    let (ctx, _) = build_ctx(program_id, dwallet_program, cpi_authority, caller_program)?;

    let mut proposal_data = proposal.try_borrow_mut()?;
    if proposal_data.len() < PROPOSAL_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut yes_votes = read_u64_le(&proposal_data[96..104]);
    let mut no_votes = read_u64_le(&proposal_data[104..112]);
    let quorum = proposal_data[112] as u64;
    let signature_scheme = u16::from_le_bytes([proposal_data[113], proposal_data[114]]);
    let status = proposal_data[115];
    let approved_bump = proposal_data[116];

    if status == STATUS_APPROVED {
        return Err(ProgramError::InvalidAccountData);
    }

    if vote_value == VOTE_YES {
        yes_votes = yes_votes.saturating_add(1);
    } else {
        no_votes = no_votes.saturating_add(1);
    }
    write_u64_le(&mut proposal_data[96..104], yes_votes);
    write_u64_le(&mut proposal_data[104..112], no_votes);

    if yes_votes >= quorum {
        let mut message_digest = [0u8; 32];
        message_digest.copy_from_slice(&proposal_data[64..96]);
        let mut user_pubkey = [0u8; 32];
        user_pubkey.copy_from_slice(&data[1..33]);
        let message_metadata_digest = [0u8; 32];

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
            approved_bump,
        )?;

        proposal_data[115] = STATUS_APPROVED;
    }

    Ok(())
}
