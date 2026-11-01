// Token amounts are BigInt (u64 base units); JSON has no BigInt, so send them as strings.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function toJSON(this: bigint) {
  return this.toString();
};
export {};
