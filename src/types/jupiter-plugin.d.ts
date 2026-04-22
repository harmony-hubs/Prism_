/** Minimal typings for Jupiter Plugin loaded from https://plugin.jup.ag/plugin-v1.js */
export interface JupiterPluginInit {
  displayMode?: 'modal' | 'integrated' | 'widget';
  integratedTargetId?: string;
  autoConnect?: boolean;
  enableWalletPassthrough?: boolean;
}

export interface JupiterPluginApi {
  init: (props: JupiterPluginInit) => void;
  close?: () => void;
  resume?: () => void;
}

declare global {
  interface Window {
    Jupiter?: JupiterPluginApi;
  }
}

export {};
