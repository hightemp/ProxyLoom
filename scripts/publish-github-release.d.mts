export interface GitHubCommandResult {
  readonly status: number
  readonly stderr: string
  readonly stdout: string
}

export type GitHubRunner = (args: readonly string[]) => GitHubCommandResult

export interface ReleaseOutput {
  write(value: string): unknown
}

export function parseChecksumManifest(source: string): Map<string, string>

export function verifyReleaseAssets(assetPaths: readonly string[]): Promise<readonly string[]>

export function publishGitHubRelease(options: {
  readonly tag: string
  readonly assetPaths: readonly string[]
  readonly runner?: GitHubRunner
  readonly output?: ReleaseOutput
}): Promise<void>
