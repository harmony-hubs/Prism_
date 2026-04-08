module hollow::identity {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use std::string::{Self, String};
    use sui::event;
    use std::vector;

    const ENotOwner: u64 = 0;
    const ECredentialNotFound: u64 = 1;
    const EAlreadyVerified: u64 = 2;

    /// A Hollow Identity is a private cross-chain shell.
    /// It controls native addresses on BTC, ETH, and SOL via a single Ika dWallet,
    /// and stores encrypted credentials that can be selectively disclosed.
    struct HollowIdentity has key, store {
        id: UID,
        owner: address,
        dwallet_id: vector<u8>,
        dwallet_pubkey: vector<u8>,
        encrypted_chain_addresses: vector<u8>,
        credentials: vector<Credential>,
        disclosure_count: u64,
    }

    /// An encrypted credential attached to a Hollow Identity.
    /// The `encrypted_value` is only decryptable by the owner via Encrypt.
    struct Credential has store, copy, drop {
        credential_type: String,
        encrypted_value: vector<u8>,
        disclosed: bool,
        disclosed_to: address,
    }

    struct HollowCreated has copy, drop {
        hollow_id: ID,
        owner: address,
    }

    struct CredentialAdded has copy, drop {
        hollow_id: ID,
        credential_type: String,
    }

    struct SelectiveDisclosure has copy, drop {
        hollow_id: ID,
        credential_type: String,
        verifier: address,
    }

    struct CrossChainActionApproved has copy, drop {
        hollow_id: ID,
        target_chain: String,
        message_hash: vector<u8>,
    }

    /// Create a new Hollow Identity linked to an Ika dWallet.
    public entry fun create_hollow(
        dwallet_id: vector<u8>,
        dwallet_pubkey: vector<u8>,
        encrypted_chain_addresses: vector<u8>,
        ctx: &mut TxContext
    ) {
        let hollow = HollowIdentity {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            dwallet_id,
            dwallet_pubkey,
            encrypted_chain_addresses,
            credentials: vector::empty<Credential>(),
            disclosure_count: 0,
        };

        event::emit(HollowCreated {
            hollow_id: object::uid_to_inner(&hollow.id),
            owner: tx_context::sender(ctx),
        });

        transfer::public_transfer(hollow, tx_context::sender(ctx));
    }

    /// Add an encrypted credential (balance proof, chain activity, reputation).
    public entry fun add_credential(
        hollow: &mut HollowIdentity,
        credential_type: vector<u8>,
        encrypted_value: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(hollow.owner == tx_context::sender(ctx), ENotOwner);

        let cred = Credential {
            credential_type: string::utf8(credential_type),
            encrypted_value,
            disclosed: false,
            disclosed_to: @0x0,
        };
        vector::push_back(&mut hollow.credentials, cred);

        event::emit(CredentialAdded {
            hollow_id: object::uid_to_inner(&hollow.id),
            credential_type: string::utf8(credential_type),
        });
    }

    /// Selectively disclose a credential to a specific verifier.
    public entry fun selective_disclose(
        hollow: &mut HollowIdentity,
        credential_index: u64,
        verifier: address,
        ctx: &mut TxContext
    ) {
        assert!(hollow.owner == tx_context::sender(ctx), ENotOwner);

        let cred = vector::borrow_mut(&mut hollow.credentials, credential_index);
        cred.disclosed = true;
        cred.disclosed_to = verifier;
        hollow.disclosure_count = hollow.disclosure_count + 1;

        event::emit(SelectiveDisclosure {
            hollow_id: object::uid_to_inner(&hollow.id),
            credential_type: cred.credential_type,
            verifier,
        });
    }

    /// Approve a cross-chain action via Ika 2PC-MPC signing.
    public entry fun approve_action(
        hollow: &mut HollowIdentity,
        target_chain: vector<u8>,
        message_hash: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(hollow.owner == tx_context::sender(ctx), ENotOwner);

        event::emit(CrossChainActionApproved {
            hollow_id: object::uid_to_inner(&hollow.id),
            target_chain: string::utf8(target_chain),
            message_hash,
        });
    }

    /// Update encrypted chain addresses (e.g., after key rotation).
    public entry fun update_chain_addresses(
        hollow: &mut HollowIdentity,
        new_encrypted_addresses: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(hollow.owner == tx_context::sender(ctx), ENotOwner);
        hollow.encrypted_chain_addresses = new_encrypted_addresses;
    }

    /// Transfer ownership (e.g., to a DAO or recovery address).
    public entry fun transfer_hollow(
        hollow: HollowIdentity,
        recipient: address,
        _ctx: &mut TxContext
    ) {
        transfer::public_transfer(hollow, recipient);
    }
}
