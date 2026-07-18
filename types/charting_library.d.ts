declare global {
  interface Window {
    TradingView: {
      widget: new (options: any) => any;
    };
  }
}
export {};
