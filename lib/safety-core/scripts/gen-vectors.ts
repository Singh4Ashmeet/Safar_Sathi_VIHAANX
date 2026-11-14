import fs from 'node:fs';
import path from 'node:path';
import nacl from 'tweetnacl';
import {
  buildPacket,
  bytesToBase64,
  bytesToHex,
  computeSenderTag,
  hexToBytes,
  uuidToBytes,
} from '../src/index.js';

const serverBoxSeed = new Uint8Array(32).fill(0x11);
const serverBox = nacl.box.keyPair.fromSecretKey(serverBoxSeed);
const senderSignSeed = new Uint8Array(32).fill(0x22);
const senderSign = nacl.sign.keyPair.fromSeed(senderSignSeed);
const ephSecret = new Uint8Array(32).fill(0x33);
const nonce = new Uint8Array(24).fill(0x44);

const v1CreatedAt = 1762900000;
const v1EpochDay = Math.floor(v1CreatedAt / 86400);
const v1Plaintext = {
  lat: 28.6139123,
  lng: 77.2090123,
  accuracyM: 12,
  locTs: v1CreatedAt,
  msgCode: 1,
  battery: 78,
  duress: false,
};
const v1Raw = buildPacket({
  eventId: uuidToBytes('11111111-2222-4333-8444-555555555555'),
  destTag: hexToBytes('a1b2c3d4e5f60708'),
  createdAtSec: v1CreatedAt,
  epochDay: v1EpochDay,
  ttl: 10,
  priority: 3,
  plaintext: v1Plaintext,
  serverBoxPublicKey: serverBox.publicKey,
  senderSignPublicKey: senderSign.publicKey,
  senderSignSecretKey: senderSign.secretKey,
  nonce,
  ephemeralSecretKey: ephSecret,
});

const v2Plaintext = {
  lat: 19.0760123,
  lng: 72.8777123,
  accuracyM: 25,
  locTs: v1CreatedAt + 60,
  msgCode: 2,
  battery: 19,
  duress: true,
};
const v2Nonce = new Uint8Array(24).fill(0x55);
const v2EphSecret = new Uint8Array(32).fill(0x66);
const v2Raw = buildPacket({
  eventId: uuidToBytes('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
  destTag: hexToBytes('a1b2c3d4e5f60708'),
  createdAtSec: v1CreatedAt + 60,
  epochDay: v1EpochDay,
  ttl: 8,
  priority: 3,
  plaintext: v2Plaintext,
  serverBoxPublicKey: serverBox.publicKey,
  senderSignPublicKey: senderSign.publicKey,
  senderSignSecretKey: senderSign.secretKey,
  nonce: v2Nonce,
  ephemeralSecretKey: v2EphSecret,
});

const out = {
  version: 1,
  note: 'Golden test vectors shared between SafarSaathi mobile app and api-server',
  vectors: [
    {
      name: 'critical_sos_normal',
      sosId: '11111111-2222-4333-8444-555555555555',
      serverBoxPublicKeyB64: bytesToBase64(serverBox.publicKey),
      serverBoxSecretKeyB64: bytesToBase64(serverBox.secretKey),
      senderSignPublicKeyB64: bytesToBase64(senderSign.publicKey),
      senderSignSeedHex: bytesToHex(senderSignSeed),
      ephemeralSecretHex: bytesToHex(ephSecret),
      nonceHex: bytesToHex(nonce),
      destTagHex: 'a1b2c3d4e5f60708',
      createdAtSec: v1CreatedAt,
      epochDay: v1EpochDay,
      expectedSenderTagHex: bytesToHex(computeSenderTag(senderSign.publicKey, v1EpochDay)),
      ttl: 10,
      priority: 3,
      plaintext: v1Plaintext,
      packetB64: bytesToBase64(v1Raw),
    },
    {
      name: 'critical_sos_duress',
      sosId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      serverBoxPublicKeyB64: bytesToBase64(serverBox.publicKey),
      serverBoxSecretKeyB64: bytesToBase64(serverBox.secretKey),
      senderSignPublicKeyB64: bytesToBase64(senderSign.publicKey),
      senderSignSeedHex: bytesToHex(senderSignSeed),
      ephemeralSecretHex: bytesToHex(v2EphSecret),
      nonceHex: bytesToHex(v2Nonce),
      destTagHex: 'a1b2c3d4e5f60708',
      createdAtSec: v1CreatedAt + 60,
      epochDay: v1EpochDay,
      expectedSenderTagHex: bytesToHex(computeSenderTag(senderSign.publicKey, v1EpochDay)),
      ttl: 8,
      priority: 3,
      plaintext: v2Plaintext,
      packetB64: bytesToBase64(v2Raw),
    },
  ],
};

const targetPath = path.resolve(import.meta.dirname, '..', 'test-vectors.json');
fs.writeFileSync(targetPath, JSON.stringify(out, null, 2) + '\n');
console.log('Generated', targetPath);

