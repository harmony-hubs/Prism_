#![no_std]
extern crate alloc;

use ika_dwallet_pinocchio::DWalletContext;
use pinocchio::{
    account_info::AccountInfo, entrypoint, msg, program_error::ProgramError, pubkey::Pubkey,
    ProgramResult,
};

entrypoint!(process_instruction);
pinocchio::nostd_panic_handler!();

// Demo program id placeholder. Replace for real deployment.
pub const ID: Pubkey = Pubkey::new_from_array([9u8; 32]);

const CREATE_PROPOSAL: u8 = 0;
const CAST_VOTE: u8 = 1;

const STATUS_PENDING: u8 = 0;
const STATUS_APPROVED: u8 = 1;

const VOTE_NO: u8 = 0;
const VOTE_YES: u8 = 1;

const SIG_ED25519: u8 = 0; // Solana
const SIG_SECP256K1: u8 = 1; // Bitcoin/Ethereum
const SIG_SECP256R1: u8 = 2; // Future support

// Proposal account fixed layout (116 bytes)
// [0..32]   creator
// [32..64]  dwallet
// [64..96]  message_hash
// [96..104] yes_votes (u64 LE)
// [104..112] no_votes (u64 LE)
// [112]     quorum (u8)
// [113]     signature_scheme (u8)
// [114]     status (u8)
// [115]     approved_bump (u8)
const PROPOSAL_LEN: usize = 116;

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
    program_id: &Pubkey,
    dwallet_program: &'a AccountInfo,
    cpi_authority: &'a AccountInfo,
    caller_program: &'a AccountInfo,
) -> Result<(DWalletContext<'a>, u8), ProgramError> {
    let (expected_cpi, bump) =
        Pubkey::find_program_address(&[b"__ika_cpi_authority"], program_id);
    if *cpi_authority.key() != expected_cpi {
        msg!("CPI authority PDA mismatch");
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
    program_id: &Pubkey,
    accounts: &[AccountInfo],
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
/// [33]    signature_scheme (0 ed25519, 1 secp256k1, 2 secp256r1)
/// [34]    approved_bump (message approval PDA bump)
fn create_proposal(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 35 {
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
    let signature_scheme = data[33];
    let approved_bump = data[34];

    match signature_scheme {
        SIG_ED25519 | SIG_SECP256K1 | SIG_SECP256R1 => {}
        _ => return Err(ProgramError::InvalidInstructionData),
    }
    if quorum == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut proposal_data = proposal.try_borrow_mut_data()?;
    if proposal_data.len() < PROPOSAL_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Initialize proposal
    proposal_data[0..32].copy_from_slice(creator.key().as_ref());
    proposal_data[32..64].copy_from_slice(dwallet.key().as_ref());
    proposal_data[64..96].copy_from_slice(message_hash);
    write_u64_le(&mut proposal_data[96..104], 0);
    write_u64_le(&mut proposal_data[104..112], 0);
    proposal_data[112] = quorum;
    proposal_data[113] = signature_scheme;
    proposal_data[114] = STATUS_PENDING;
    proposal_data[115] = approved_bump;

    msg!("Proposal created");
    Ok(())
}

/// cast_vote (discriminator = 1)
///
/// Accounts:
/// 0. [signer]   voter
/// 1. [writable] proposal PDA
/// 2. [writable] vote_record PDA (created once per voter+proposal)
/// 3. [writable] message_approval PDA
/// 4. []         dwallet account
/// 5. [signer]   payer
/// 6. []         system_program
/// 7. []         dwallet_program
/// 8. []         cpi_authority PDA
/// 9. []         caller_program (this program)
///
/// Data:
/// [0] vote_value (0 no, 1 yes)
/// [1..33] user_pubkey (target chain pubkey bytes)
fn cast_vote(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 10 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 33 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let voter = &accounts[0];
    let proposal = &accounts[1];
    let vote_record = &accounts[2];
    let message_approval = &accounts[3];
    let dwallet = &accounts[4];
    let payer = &accounts[5];
    let system_program = &accounts[6];
    let dwallet_program = &accounts[7];
    let cpi_authority = &accounts[8];
    let caller_program = &accounts[9];

    if !voter.is_signer() || !payer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let vote_value = data[0];
    if vote_value != VOTE_NO && vote_value != VOTE_YES {
        return Err(ProgramError::InvalidInstructionData);
    }
    let user_pubkey = &data[1..33];

    // Prevent double voting by checking vote record initialization
    {
        let mut vr_data = vote_record.try_borrow_mut_data()?;
        if vr_data.len() < VOTE_RECORD_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let already_voted = vr_data[0..32].iter().any(|b| *b != 0);
        if already_voted {
            msg!("Voter already voted");
            return Err(ProgramError::AccountAlreadyInitialized);
        }
        vr_data[0..32].copy_from_slice(voter.key().as_ref());
        vr_data[32] = vote_value;
    }

    let (ctx, _) = build_ctx(program_id, dwallet_program, cpi_authority, caller_program)?;

    let mut proposal_data = proposal.try_borrow_mut_data()?;
    if proposal_data.len() < PROPOSAL_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut yes_votes = read_u64_le(&proposal_data[96..104]);
    let mut no_votes = read_u64_le(&proposal_data[104..112]);
    let quorum = proposal_data[112] as u64;
    let signature_scheme = proposal_data[113];
    let status = proposal_data[114];
    let approved_bump = proposal_data[115];

    if status == STATUS_APPROVED {
        msg!("Proposal already approved");
        return Err(ProgramError::InvalidAccountData);
    }

    if vote_value == VOTE_YES {
        yes_votes = yes_votes.saturating_add(1);
    } else {
        no_votes = no_votes.saturating_add(1);
    }
    write_u64_le(&mut proposal_data[96..104], yes_votes);
    write_u64_le(&mut proposal_data[104..112], no_votes);

    msg!("Vote recorded");

    if yes_votes >= quorum {
        let mut message_hash = [0u8; 32];
        message_hash.copy_from_slice(&proposal_data[64..96]);

        ctx.approve_message(
            message_approval,
            dwallet,
            payer,
            system_program,
            &message_hash,
            user_pubkey,
            signature_scheme,
            approved_bump,
        )?;

        proposal_data[114] = STATUS_APPROVED;
        msg!("Quorum reached: proposal approved and message sent to Ika");
    }

    Ok(())
}
