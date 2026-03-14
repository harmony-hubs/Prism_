module harmony_heart::heart {
        use sui::object::{Self, UID};
        use sui::tx_context::{Self, TxContext};
        use sui::transfer;
        use std::string::{Self, String};
    
        /// The Heart NFT representing a multi-chain pulse
        struct HarmonyHeart has key, store {
            id: UID,
            name: String,
            description: String,
            url: String,
            pulses: u64,
        }
    
        /// Mint a new Harmony Heart
        public entry fun mint(
            name: vector<u8>,
            description: vector<u8>,
            url: vector<u8>,
            ctx: &mut TxContext
        ) {
            let heart = HarmonyHeart {
                id: object::new(ctx),
                name: string::utf8(name),
                description: string::utf8(description),
                url: string::utf8(url),
                pulses: 0,
            };
            transfer::public_transfer(heart, tx_context::sender(ctx));
        }
    
        /// Increment the pulse count (simulating a cross-chain action)
        public entry fun pulse(heart: &mut HarmonyHeart) {
            heart.pulses = heart.pulses + 1;
        }
    }
    