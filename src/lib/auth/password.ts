/**
 * Passwords, stored so that the stored form is useless to whoever finds it.
 *
 * scrypt from `node:crypto`, and no dependency. The alternative was a pure-JS bcrypt for
 * one function in an app that has just finished deleting a dependency it no longer used;
 * scrypt is a password KDF in the standard library, deliberately slow, deliberately
 * memory-hungry. Originally the only throttle on login attempts this app had; `PLAN.md`
 * (v3.2, point 10) later added a database-backed rate limit (`rateLimitHits`) on top,
 * shared with registration and password recovery.
 *
 * The stored string says how it was made:
 *
 *     scrypt$16384$8$1$<salt base64>$<hash base64>
 *
 * so the parameters can be raised later without a migration: an old row still verifies
 * with the numbers it was written with, and is rewritten with the new ones the next time
 * its owner sets a password. Nothing about the format is secret; the salt is not either.
 */

import {
  type ScryptOptions,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

import { MAX_PASSWORD, MIN_PASSWORD } from './types'

/*
 * Typed by hand: `promisify` picks the overload without options, so the parameters this
 * module exists to choose would not typecheck through it.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>

/**
 * Cost, chosen by measurement rather than by convention.
 *
 * N = 16384, r = 8, p = 1 uses 128·N·r = 16 MiB and was measured at **34 ms to hash and
 * 30 ms to verify** on the machine this was written on — the right order for a login path
 * that also has to answer a database query, and slow enough that guessing is expensive.
 * Expect it to be several times that on a small serverless instance, which is the other
 * half of the reason there is no rate limiting: the cost per attempt *is* the limit.
 *
 * Raising N to 32768 doubles both the time and the memory, and would need `maxmem` raised
 * past Node's 32 MiB default — a cliff worth knowing about before somebody "improves" this
 * constant.
 */
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

/**
 * A password long enough to be worth hashing.
 *
 * Length only, with no composition rules: a rule that demands a digit and a capital is how
 * you get `Password1`. Ten characters is the floor, and there is a ceiling because scrypt
 * will happily spend a second on a megabyte someone pasted in.
 *
 * The two numbers live in `auth/types.ts`, which imports nothing: a form has to state the
 * rule, and a form must not pull `node:crypto` into the browser to read it.
 */
export function isPasswordAcceptable(password: string): boolean {
  return password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD
}

function encode(salt: Buffer, hash: Buffer): string {
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const hash = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P })

  return encode(salt, hash)
}

interface Stored {
  n: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

function decode(stored: string): Stored | null {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null

  const [, n, r, p, salt, hash] = parts
  const numbers = [Number(n), Number(r), Number(p)]
  if (numbers.some((value) => !Number.isInteger(value) || value <= 0)) return null

  try {
    return {
      n: numbers[0],
      r: numbers[1],
      p: numbers[2],
      salt: Buffer.from(salt, 'base64'),
      hash: Buffer.from(hash, 'base64'),
    }
  } catch {
    return null
  }
}

/**
 * Whether this password made that hash.
 *
 * `timingSafeEqual` rather than `===`, so the comparison does not leak how much of the
 * hash matched. A stored value that cannot be parsed answers false rather than throwing:
 * it is a row nobody can log in with, which is exactly what a corrupt one should be.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = decode(stored)
  if (parsed === null) return false

  try {
    const hash = await scrypt(password, parsed.salt, parsed.hash.length, {
      N: parsed.n,
      r: parsed.r,
      p: parsed.p,
      // Enough for the parameters this app writes, and for a row written with more.
      maxmem: 256 * 1024 * 1024,
    })

    return hash.length === parsed.hash.length && timingSafeEqual(hash, parsed.hash)
  } catch {
    return false
  }
}

/**
 * A hash of nothing, to be verified against when there is no row.
 *
 * Without this, "no such address" answers in a millisecond and "wrong password" answers in
 * thirty, which tells anyone who asks which addresses exist. Generated once per
 * process, from random bytes nobody keeps: it only has to cost the same as a real one.
 */
let decoy: string | null = null

export async function verifyAgainstNothing(password: string): Promise<false> {
  decoy ??= await hashPassword(randomBytes(24).toString('base64'))
  await verifyPassword(password, decoy)

  return false
}
