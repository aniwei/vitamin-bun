export type * from '@vitamin-ai/shared'


export type IncomingMessage = 
 | {
    type: 'channel:register',
    name: string,
    messagePort: MessagePort
 } | {
    type: 'channel:unregister',
    name: string
 } | {
    type: 'register:serve',
    name: string,
    port: number
 } | {
    type: 'unregister:serve',
    name: string,
    port: number
 }