import type {
  RegexWorkerRequest,
  RegexWorkerResponse,
} from '../src/application/regex-tester/regex-batch-tester'

export default defineUnlistedScript(() => {
  const worker = self as unknown as {
    onmessage: ((event: MessageEvent<RegexWorkerRequest>) => void) | null
    postMessage(message: RegexWorkerResponse): void
  }
  worker.onmessage = (event) => {
    const expression = new RegExp(event.data.pattern, event.data.flags)
    worker.postMessage({
      results: event.data.targets.map((target) => ({
        index: target.index,
        matched: expression.test(target.value),
      })),
    })
  }
})
