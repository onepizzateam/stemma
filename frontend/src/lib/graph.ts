export const formatMON = (value: bigint | number, decimals = 4) => `${(typeof value === 'bigint' ? Number(value) / 1e18 : value).toFixed(decimals)}`
export const shortAddress = (address: string) => `${address.slice(0, 8)}...${address.slice(-4)}`
export const errorMessage = (error: unknown) => error instanceof Error ? error.message.replace(/^.*reason:\s*/i, '') : 'Transaction reverted'
