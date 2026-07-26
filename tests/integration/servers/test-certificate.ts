import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface EphemeralCertificate {
  readonly certificate: Buffer
  readonly privateKey: Buffer
  close(): Promise<void>
}

export const createEphemeralCertificate = async (): Promise<EphemeralCertificate> => {
  const directory = await mkdtemp(join(tmpdir(), 'proxyloom-certificate-'))
  const certificatePath = join(directory, 'certificate.pem')
  const keyPath = join(directory, 'private-key.pem')
  try {
    await execFileAsync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=*.proxyloom.test',
      '-addext',
      'subjectAltName=DNS:*.proxyloom.test,DNS:origin.proxyloom.test,DNS:proxy.proxyloom.test,IP:127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
    ])
    const [certificate, privateKey] = await Promise.all([
      readFile(certificatePath),
      readFile(keyPath),
    ])
    return {
      certificate,
      close: async () => {
        await rm(directory, { force: true, recursive: true })
      },
      privateKey,
    }
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}
