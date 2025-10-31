declare module '@paddle/paddle-node-sdk' {
  export enum Environment {
    sandbox = 'sandbox',
    production = 'production',
  }

  export type TransactionsCreateRequest = any;

  export interface TransactionsAPI {
    create(payload: TransactionsCreateRequest): Promise<any>;
  }

  export interface SubscriptionsAPI {
    get(id: string): Promise<any>;
    cancel(id: string, opts?: any): Promise<any>;
  }

  export class Paddle {
    constructor(apiKey: string, opts?: { environment?: Environment });
    transactions: TransactionsAPI;
    subscriptions: SubscriptionsAPI;
  }

  export default Paddle;
}
