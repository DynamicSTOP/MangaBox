import crypto from 'crypto'

export const deepObjectMerge = (target, ...sources) => {
  if (target === null || typeof target !== 'object') return

  sources.filter((source) => source !== null && typeof source === 'object')
    .map((source) => {
      Object.keys(source).map((key) => {
        // thanks javascript for typeof null === "object"
        if (target[key] !== null && source[key] !== null && typeof target[key] === 'object' && typeof source[key] === 'object') {
          deepObjectMerge(target[key], source[key])
        } else {
          target[key] = source[key]
        }
      })
    })
}

export const getSHA = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}
