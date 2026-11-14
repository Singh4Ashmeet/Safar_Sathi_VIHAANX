// Type bridge for the shared package's declaration-only build. Runtime tests
// resolve the package source through the Vitest workspace alias.
declare module '@workspace/safety-core' {
  export {
    PACKET_BYTE_LENGTH,
    bytesToUuid,
    decryptPacketPayload,
    parsePacket,
    verifyPacketSignature,
  } from '../../../../lib/safety-core/dist/packetCodec.d.ts';
  export {
    base64ToBytes,
    bytesToBase64,
    constantTimeEqualBytes,
    hexToBytes,
  } from '../../../../lib/safety-core/dist/hash.d.ts';
  export { computeSenderTag, epochDayFromUnixSec } from '../../../../lib/safety-core/dist/crypto.d.ts';
}
