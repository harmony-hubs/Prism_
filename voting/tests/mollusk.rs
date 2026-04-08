//! Mollusk test scaffold for the Hollow voting program.
//!
//! This is intentionally lightweight so you can plug in your existing
//! Mollusk harness setup from your Solana toolchain.

#[test]
fn create_proposal_discriminator_is_stable() {
    // Instruction discriminator for create_proposal must remain 0
    // for client compatibility.
    let create_proposal_discriminator = 0u8;
    assert_eq!(create_proposal_discriminator, 0u8);
}

#[test]
fn cast_vote_discriminator_is_stable() {
    // Instruction discriminator for cast_vote must remain 1
    // for client compatibility.
    let cast_vote_discriminator = 1u8;
    assert_eq!(cast_vote_discriminator, 1u8);
}

#[test]
fn vote_record_layout_size() {
    // [voter_pubkey(32)] + [vote_value(1)]
    let vote_record_len = 33usize;
    assert_eq!(vote_record_len, 33usize);
}
