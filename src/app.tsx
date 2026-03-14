import React from 'react';
import { initWaaP } from '@human.tech/waap-sdk';
import { PassportScoreWidget, DarkTheme } from '@gitcoin/passport-scorer';
import { IkaClient, getNetworkConfig } from '@ika.xyz/sdk';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
// 1. Initialize WaaP for Social Login
initWaaP({
  config: {
    authenticationMethods: ['email', 'phone', 'social'],
    allowedSocials: ['google', 'discord', 'twitter', 'github', 'bluesky'],
    styles: {
      darkMode: false
    }
  }
});

// 2. Initialize Ika Client on Sui Testnet
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
const ikaClient = new IkaClient({
  suiClient,
  config: getNetworkConfig('testnet'),
  network: 'testnet',
});
console.log("Harmony Heart Beats: Infrastructure Initialized.");
export async function createHeartWallet() {

  // Logic for creating the dWallet 'Heart' using Ika
  const dWallet = await ikaClient.createDWallet();
  console.log("Heart Wallet Created:", dWallet);
  return dWallet;
}


import { Transaction } from '@mysten/sui/transactions';
    
    // The Package ID of your deployed Move contract (placeholder for now)
    const PACKAGE_ID = '0xYOUR_DEPLOYED_PACKAGE_ID';
    
    export async function mintHeart(name: string, description: string, url: string) {
      const tx = new Transaction();
      
      tx.moveCall({
        target: `${PACKAGE_ID}::heart::mint`,
        arguments: [
          tx.pure.string(name),
          tx.pure.string(description),
          tx.pure.string(url),
        ],
      });
    
      // In a real app, you would sign and execute this using the WaaP/Ika wallet
      // For now, we log the transaction block
      console.log("Minting transaction prepared:", tx);
      
      // Example of how you would sign with Ika (conceptual):
      // const result = await ikaClient.signAndExecuteTransaction({ transactionBlock: tx });
      // return result;
    }import { initWaaP } from '@human.tech/waap-sdk';
    import { IkaClient, getNetworkConfig } from '@ika.xyz/sdk';
    import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
    import { Transaction } from '@mysten/sui/transactions';

    
    // TODO: Configure WaaP with your Project ID from human.tech
    // Visit https://human.tech to get your Project ID and set up your Gas Tank for 'Harmony' pulses.
    // InitWaaP({
    //   projectId: 'YOUR_PROJECT_ID_HERE', // <-- REPLACE WITH YOUR WaaP PROJECT ID
    //   appName: 'Harmony-Heart-Beats',
    //   waapButtonPosition: 'bottom-right'
    // });
        // 1. Initialize WaaP for Social Login
    initWaaP({
      walletConnectProjectId: 'YOUR_PROJECT_ID'
    });
    
    // 2. Initialize Ika Client on Sui Testnet
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    const ikaClient = new IkaClient({
      suiClient,
      config: getNetworkConfig('testnet'),
      network: 'testnet',
    });
    
    // The Package ID of your deployed Move contract (placeholder)
    const PACKAGE_ID = '0xYOUR_DEPLOYED_PACKAGE_ID';
    
    console.log("Harmony Heart Beats: Infrastructure Initialized.");
    
    export async function createHeartWallet() {
      const dWallet = await ikaClient.createDWallet();
      console.log("Heart Wallet Created:", dWallet);
      return dWallet;
    }
    
    /**
     * 3. Configure WaaP Social Login
     * * To get your Project ID:
     * 1. Visit https://human.tech and sign in.
     * 2. Create a new project for "Harmony Heart Beats".
     * 3. Copy your Project ID and replace 'YOUR_PROJECT_ID' below.
     * 4. Set up a 'Gas Tank' in the dashboard to sponsor your users' first pulses!
     */
    export async function loginWithWaaP() {
      try {
        // This initiates the social login flow (Google, Apple, etc.)
        // via the WaaP protocol.
        const account = await (window as any).waap.login();
        console.log("Logged in with WaaP. Account:", account);
        return account;
      } catch (error) {
        console.error("WaaP Login failed:", error);
        throw error;
      }
    }
    
    export async function mintHeart(name: string, description: string, url: string) {
      const tx = new Transaction();
      
      tx.moveCall({
        target: `${PACKAGE_ID}::heart::mint`,
        arguments: [
          tx.pure.string(name),
          tx.pure.string(description),
          tx.pure.string(url),
        ],<control>s
      });
    
      console.log("Minting transaction prepared:", tx);
      
      // To execute:
      // const result = await ikaClient.signAndExecuteTransaction({ transactionBlock: tx });
      // return result;
    }

export const PassportWidget: React.FC<{ userAddress: string; signMessage: (message: string) => Promise<string> }> = ({ userAddress, signMessage }) => {
  const PASSPORT_API_KEY = 'YOUR_PASSPORT_API_KEY'; // Replace with your API key
  const PASSPORT_SCORER_ID = 'YOUR_PASSPORT_SCORER_ID'; // Replace with your scorer ID

  return (
    <PassportScoreWidget
      apiKey={PASSPORT_API_KEY}
      scorerId={PASSPORT_SCORER_ID}
      address={userAddress}
      generateSignatureCallback={signMessage}
      theme={DarkTheme}
    />
  );
};
    