export const config = {
  api: {
    bodyParser: false,
  },
}

const TARGET_API_BASE = 'https://api.linengrass.com/api'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
])

async function readRequestBody(req) {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path || ''
  const normalizedPath = String(rawPath).replace(/^\/+/, '')
  const targetUrl = new URL(`${TARGET_API_BASE}/${normalizedPath}`)

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') {
      return
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => targetUrl.searchParams.append(key, entry))
      return
    }

    if (typeof value === 'string') {
      targetUrl.searchParams.set(key, value)
    }
  })

  const headers = {}
  Object.entries(req.headers).forEach(([key, value]) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || value === undefined) {
      return
    }

    headers[key] = value
  })

  const requestBody =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req)

  if (requestBody) {
    headers['content-length'] = String(requestBody.length)
  }

  const upstreamResponse = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: requestBody,
  })

  res.status(upstreamResponse.status)

  upstreamResponse.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return
    }

    res.setHeader(key, value)
  })

  const body = Buffer.from(await upstreamResponse.arrayBuffer())
  res.send(body)
}
