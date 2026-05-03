import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'dc-upload-dashboard'
const HARDCODED_COMPANY_ID = '100000'
const HARDCODED_BEARER_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjaGFyYW5AZ21haWwuY29tIiwidXNlcklkIjoxMDAzMDUsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc3NzE2Mzg1MSwiZXhwIjoxNzgyMzQ3ODUxfQ.Y5MMdYpf2qLO7G0IUYqzIQU5MhniWSWzI1kC_6L6-R4'
const WAREHOUSES = [
  { label: 'Malleswaram', dcId: '100000' },
  { label: 'Jayanagar', dcId: '100001' },
]

const getNextMonthValue = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 7)
}

const createDayKey = (monthValue, day) => `${monthValue}-${String(day).padStart(2, '0')}`

const buildDays = (monthValue) => {
  if (!monthValue) {
    return []
  }

  const [year, month] = monthValue.split('-').map(Number)
  const totalDays = new Date(year, month, 0).getDate()

  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1
    const date = new Date(year, month - 1, day)

    return {
      day,
      key: createDayKey(monthValue, day),
      label: date.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
      }),
    }
  })
}

const readStoredState = () => {
  const fallback = {
    apiBaseUrl: '/api/proxy',
    customerPath: '/customers',
    visitSearchPath: '/trips/search',
    tripDetailsPathTemplate: '/trips/{tripId}/details',
    ocrUploadPathTemplate: '/trips/visits/{visitId}/delivery-challans/upload',
    uploadPathTemplate: '/trips/visits/{visitId}/delivery-challans/upload-with-number',
    companyId: HARDCODED_COMPANY_ID,
    dcId: WAREHOUSES[0].dcId,
    token: HARDCODED_BEARER_TOKEN,
    monthValue: getNextMonthValue(),
  }

  const stored = localStorage.getItem(STORAGE_KEY)

  if (!stored) {
    return fallback
  }

  try {
    const parsed = { ...fallback, ...JSON.parse(stored) }

    if (
      parsed.visitSearchPath === '/trips/visits/by-customer-and-date-range' ||
      parsed.visitSearchPath === 'trips/visits/by-customer-and-date-range'
    ) {
      parsed.visitSearchPath = fallback.visitSearchPath
    }

    if (
      parsed.uploadPathTemplate === '/trips/visits/{visitId}/delivery-challans/upload' ||
      parsed.uploadPathTemplate === 'trips/visits/{visitId}/delivery-challans/upload'
    ) {
      parsed.uploadPathTemplate = fallback.uploadPathTemplate
    }

    if (
      parsed.ocrUploadPathTemplate === '/trips/visits/{visitId}/delivery-challans/upload-with-number' ||
      parsed.ocrUploadPathTemplate === 'trips/visits/{visitId}/delivery-challans/upload-with-number'
    ) {
      parsed.ocrUploadPathTemplate = fallback.ocrUploadPathTemplate
    }

    if (
      parsed.apiBaseUrl === 'https://apidev.linengrass.com/api' ||
      parsed.apiBaseUrl === 'https://api.linengrass.com/api'
    ) {
      parsed.apiBaseUrl = fallback.apiBaseUrl
    }

    parsed.companyId = fallback.companyId
    parsed.token = fallback.token

    if (!WAREHOUSES.some((warehouse) => warehouse.dcId === parsed.dcId)) {
      parsed.dcId = fallback.dcId
    }

    return parsed
  } catch {
    return fallback
  }
}

const normalizeBaseUrl = (value) => value.trim().replace(/\/+$/, '')
const normalizeIdValue = (value) => value.replace(/\s+/g, '').trim()
const normalizeTokenValue = (value) => value.replace(/\s+/g, '').trim()
const normalizePath = (value) => {
  const path = value.trim()
  if (!path) {
    return ''
  }

  return path.startsWith('/') ? path : `/${path}`
}

const buildApiUrl = (baseUrl, path) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedPath = normalizePath(path)
  const combinedUrl = `${normalizedBaseUrl}${normalizedPath}`

  if (/^https?:\/\//i.test(combinedUrl)) {
    return new URL(combinedUrl)
  }

  return new URL(combinedUrl, window.location.origin)
}

const buildHeaders = () => ({
  'X-Company-ID': HARDCODED_COMPANY_ID,
  Authorization: `Bearer ${HARDCODED_BEARER_TOKEN}`,
})

const normalizeName = (value) => value?.trim().toLowerCase() ?? ''

const parseCollection = (payload) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.content)) {
    return payload.content
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
  }

  if (payload && typeof payload === 'object' && (payload.id || payload.visits)) {
    return [payload]
  }

  return []
}

const normalizeCustomer = (item) => ({
  id: String(item?.id ?? item?.customerId ?? item?.partyId ?? ''),
  name: (item?.name ?? item?.customerName ?? item?.partyName ?? `Customer ${item?.id ?? ''}`).trim(),
})

const getMonthDateRange = (monthValue) => {
  if (!monthValue) {
    return { startDate: '', endDate: '' }
  }

  const [year, month] = monthValue.split('-').map(Number)
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59))

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  }
}

const getVisitDateValue = (visit) =>
  visit?.visitDate ||
  visit?.plannedDate ||
  visit?.plannedTime ||
  visit?.date ||
  visit?.createdAt ||
  ''

const toDayKey = (value) => {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim()
    const dateTimeMatch = normalizedValue.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/)

    if (dateTimeMatch) {
      const hasExplicitTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalizedValue)
      if (!hasExplicitTimezone) {
        return dateTimeMatch[1]
      }
    }
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.valueOf())) {
    return ''
  }

  const year = parsedDate.getFullYear()
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
  const day = String(parsedDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const normalizeVisit = (item) => {
  const rawDate = getVisitDateValue(item)
  const dayKey = toDayKey(rawDate)
  const firstDeliveryRequest = Array.isArray(item?.deliveryRequests) ? item.deliveryRequests[0] : null

  return {
    visitId: String(item?.visitId ?? item?.id ?? ''),
    deliveryRequestId: String(firstDeliveryRequest?.id ?? ''),
    deliveryRequestNumber: firstDeliveryRequest?.requestNumber ?? '',
    deliveryRequestStatus: firstDeliveryRequest?.status ?? '',
    dayKey,
    label: item?.status ?? item?.tripStatus ?? 'Visit available',
    raw: item,
  }
}

const buildTripDetailsUrl = (settings, tripId) =>
  `${normalizeBaseUrl(settings.apiBaseUrl)}${normalizePath(settings.tripDetailsPathTemplate).replace(
    '{tripId}',
    String(tripId),
  )}`

const buildUploadUrl = (settings, visitId) =>
  `${normalizeBaseUrl(settings.apiBaseUrl)}${normalizePath(settings.uploadPathTemplate).replace(
    '{visitId}',
    String(visitId),
  )}`

const buildOcrUploadUrl = (settings, visitId) =>
  `${normalizeBaseUrl(settings.apiBaseUrl)}${normalizePath(settings.ocrUploadPathTemplate).replace(
    '{visitId}',
    String(visitId),
  )}`

const flattenTripVisits = (payload) =>
  parseCollection(payload).flatMap((trip) => {
    const tripVisits = Array.isArray(trip?.visits) ? trip.visits : []

    return tripVisits.map((visit) => ({
      ...visit,
      tripId: visit?.tripId ?? trip?.id,
      tripStatus: visit?.tripStatus ?? trip?.status ?? trip?.tripStatus,
      plannedTime: visit?.plannedTime ?? trip?.plannedDate ?? visit?.visitDate,
    }))
  })

const visitMatchesCustomer = (visit, customer) => {
  if (!customer) {
    return false
  }

  const visitPartyId = String(visit?.partyId ?? visit?.customerId ?? '')
  const customerId = String(customer.id)

  if (visitPartyId && customerId && visitPartyId === customerId) {
    return true
  }

  return normalizeName(visit?.partyName ?? visit?.customerName) === normalizeName(customer.name)
}

async function parseResponse(response) {
  const rawText = await response.text()

  try {
    return JSON.parse(rawText)
  } catch {
    return rawText
  }
}

function App() {
  const [settings, setSettings] = useState(readStoredState)
  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [challanNumber, setChallanNumber] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isAutofilling, setIsAutofilling] = useState(false)
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [isLoadingVisits, setIsLoadingVisits] = useState(false)
  const [visitsByDay, setVisitsByDay] = useState({})
  const [uploadLog, setUploadLog] = useState({})
  const [lastUploadResponse, setLastUploadResponse] = useState(null)
  const [lastOcrResponse, setLastOcrResponse] = useState(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const hasAuth = true
  const days = useMemo(() => buildDays(settings.monthValue), [settings.monthValue])
  const availableCustomers = hasAuth ? customers : []
  const selectedCustomerIdSafe =
    availableCustomers.find((customer) => customer.id === selectedCustomerId)?.id ??
    availableCustomers[0]?.id ??
    ''
  const selectedCustomer =
    availableCustomers.find((customer) => customer.id === selectedCustomerIdSafe) ??
    availableCustomers[0] ??
    null
  const selectedDayKeySafe =
    days.find((day) => day.key === selectedDayKey)?.key ?? days[0]?.key ?? ''
  const selectedDay = days.find((day) => day.key === selectedDayKeySafe)
  const effectiveVisitsByDay = hasAuth && selectedCustomerIdSafe ? visitsByDay : {}
  const selectedDayVisits = effectiveVisitsByDay[selectedDayKeySafe] ?? []
  const selectedVisit = selectedDayVisits[0] ?? null
  const selectedDeliveryRequestId = selectedVisit?.deliveryRequestId ?? ''
  const selectedDeliveryRequestNumber = selectedVisit?.deliveryRequestNumber ?? ''
  const clearUploadDraft = () => {
    setSelectedFile(null)
    setPreviewUrl('')
    setChallanNumber('')
    setMessage('')
    setError('')
  }

  const handleSettingsChange = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }))

    if (field === 'monthValue') {
      setSelectedDayKey('')
      clearUploadDraft()
    }
  }

  const handleFileChange = (file) => {
    setSelectedFile(file)
    setMessage('')
    setError('')

    if (!file) {
      setPreviewUrl('')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setPreviewUrl(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (!hasAuth) {
      return
    }

    const controller = new AbortController()

    const loadCustomers = async () => {
      setIsLoadingCustomers(true)
      setError('')

      try {
        const url = buildApiUrl(settings.apiBaseUrl, settings.customerPath)
        if (normalizeIdValue(settings.dcId)) {
          url.searchParams.set('dcId', normalizeIdValue(settings.dcId))
        }

        const response = await fetch(url.toString(), {
            headers: buildHeaders(),
            signal: controller.signal,
          })

        const data = await parseResponse(response)

        if (!response.ok) {
          throw new Error(
            typeof data === 'string' ? data : data?.message || 'Unable to fetch customers.',
          )
        }

        const normalizedCustomers = parseCollection(data)
          .map(normalizeCustomer)
          .filter((customer) => customer.id)

        setCustomers(normalizedCustomers)
      } catch (loadError) {
        if (loadError.name === 'AbortError') {
          return
        }

        setCustomers([])
        setError(loadError instanceof Error ? loadError.message : 'Unable to fetch customers.')
      } finally {
        setIsLoadingCustomers(false)
      }
    }

    loadCustomers()

    return () => controller.abort()
  }, [hasAuth, settings])

  useEffect(() => {
    if (!hasAuth || !selectedCustomerIdSafe || !settings.monthValue) {
      return
    }

    const controller = new AbortController()
    const { startDate, endDate } = getMonthDateRange(settings.monthValue)

    const loadVisits = async () => {
      setIsLoadingVisits(true)
      setError('')
      try {
        const url = buildApiUrl(settings.apiBaseUrl, settings.visitSearchPath)
        url.searchParams.set('startDate', startDate)
        url.searchParams.set('endDate', endDate)
        if (normalizeIdValue(settings.dcId)) {
          url.searchParams.set('dcId', normalizeIdValue(settings.dcId))
        }

        const response = await fetch(url.toString(), {
          headers: buildHeaders(),
          signal: controller.signal,
        })

        const data = await parseResponse(response)

        if (!response.ok) {
          throw new Error(typeof data === 'string' ? data : data?.message || 'Unable to fetch visits.')
        }

        const trips = parseCollection(data).filter((trip) => trip?.id)
        const tripDetailsResponses = await Promise.all(
          trips.map(async (trip) => {
            const detailsResponse = await fetch(buildTripDetailsUrl(settings, trip.id), {
              headers: buildHeaders(),
              signal: controller.signal,
            })

            const detailsData = await parseResponse(detailsResponse)

            if (!detailsResponse.ok) {
              throw new Error(
                typeof detailsData === 'string'
                  ? detailsData
                  : detailsData?.message || `Unable to fetch trip details for ${trip.id}.`,
              )
            }

            return detailsData
          }),
        )

        const allVisits = flattenTripVisits(tripDetailsResponses)
        const matchedVisits = allVisits.filter((visit) => visitMatchesCustomer(visit, selectedCustomer))
        const visits = matchedVisits
          .map(normalizeVisit)
          .filter((visit) => visit.visitId && visit.dayKey)

        const mappedVisits = visits.reduce((accumulator, visit) => {
          if (!accumulator[visit.dayKey]) {
            accumulator[visit.dayKey] = []
          }

          accumulator[visit.dayKey].push(visit)
          return accumulator
        }, {})

        setVisitsByDay(mappedVisits)
      } catch (loadError) {
        if (loadError.name === 'AbortError') {
          return
        }

        setVisitsByDay({})
        setError(loadError instanceof Error ? loadError.message : 'Unable to fetch visits.')
      } finally {
        setIsLoadingVisits(false)
      }
    }

    loadVisits()

    return () => controller.abort()
  }, [
    hasAuth,
    selectedCustomer,
    selectedCustomerIdSafe,
    settings,
  ])

  const handleUpload = async () => {
    if (!selectedCustomer) {
      setError('Select a customer first.')
      setMessage('')
      return
    }

    if (!selectedDayKeySafe) {
      setError('Select a day.')
      setMessage('')
      return
    }

    if (!selectedVisit?.visitId) {
      setError('No visit found for the selected customer and day.')
      setMessage('')
      return
    }

    if (!selectedDeliveryRequestId) {
      setError('No delivery request found for the selected visit.')
      setMessage('')
      return
    }

    if (!normalizeIdValue(settings.dcId)) {
      setError('DC ID is required.')
      setMessage('')
      return
    }

    if (!selectedFile) {
      setError('Choose an image before confirming.')
      setMessage('')
      return
    }

    if (!challanNumber.trim()) {
      setError('Challan number is required.')
      setMessage('')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('dcId', normalizeIdValue(settings.dcId))
    formData.append('challanNumber', challanNumber.trim())

    const requestUrl = buildUploadUrl(settings, selectedVisit.visitId)

    setIsUploading(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: buildHeaders(),
        body: formData,
      })

      const data = await parseResponse(response)

      if (!response.ok) {
        throw new Error(typeof data === 'string' ? data : data?.message || 'Upload failed.')
      }

      setLastUploadResponse(data)

      setUploadLog((current) => ({
        ...current,
        [selectedCustomer.id]: {
          ...(current[selectedCustomer.id] ?? {}),
          [selectedDayKeySafe]: {
            challanNumber: data?.challanNumber ?? '',
            uploadedAt: new Date().toLocaleString('en-IN'),
            fileName: selectedFile.name,
            visitId: selectedVisit.visitId,
            deliveryRequestId: selectedDeliveryRequestId,
            challanUrl: data?.challanUrl ?? '',
            challanDate: data?.challanDate ?? '',
            notes: data?.notes ?? '',
          },
        },
      }))

      setMessage(
        data?.notes ||
          (data?.challanUrl
            ? `${selectedCustomer.name} uploaded for ${selectedDayKeySafe}.`
            : `${selectedCustomer.name} upload request completed for ${selectedDayKeySafe}.`),
      )
      setSelectedFile(null)
      setPreviewUrl('')
      setChallanNumber('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleAutofillFromOcr = async () => {
    if (!selectedCustomer) {
      setError('Select a customer first.')
      setMessage('')
      return
    }

    if (!selectedVisit?.visitId) {
      setError('No visit found for the selected customer and day.')
      setMessage('')
      return
    }

    if (!selectedDeliveryRequestId) {
      setError('No delivery request found for the selected visit.')
      setMessage('')
      return
    }

    if (!normalizeIdValue(settings.dcId)) {
      setError('DC ID is required.')
      setMessage('')
      return
    }

    if (!selectedFile) {
      setError('Choose an image before autofill.')
      setMessage('')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('dcId', normalizeIdValue(settings.dcId))
    formData.append('targetLevelReferenceType', 'DELIVERY')
    formData.append('targetLevelReferenceId', selectedDeliveryRequestId)

    setIsAutofilling(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(buildOcrUploadUrl(settings, selectedVisit.visitId), {
        method: 'POST',
        headers: buildHeaders(),
        body: formData,
      })

      const data = await parseResponse(response)

      if (!response.ok) {
        throw new Error(typeof data === 'string' ? data : data?.message || 'OCR autofill failed.')
      }

      setLastOcrResponse(data)
      const nextChallanNumber = data?.challanNumber ?? data?.ocrData?.challanNumber ?? ''
      setChallanNumber(String(nextChallanNumber || ''))
      setMessage('OCR autofill complete. Challan number auto-filled, change if needed and confirm.')
    } catch (autofillError) {
      setError(autofillError instanceof Error ? autofillError.message : 'OCR autofill failed.')
    } finally {
      setIsAutofilling(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Delivery Challan Uploader</p>
          <h1>Upload delivery challans against the right customer visit.</h1>
          <p className="hero-copy">
            Enter your company credentials, choose a month, and select the customer. The app
            automatically fetches matching trips, maps visits by date, and helps you upload the
            challan to the correct delivery request.
          </p>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">1. Settings</p>
              <h2>Connection details</h2>
            </div>
          </div>

          <div className="inline-fields inline-fields--triple-compact">
            <label className="field">
              <span>Warehouse</span>
              <select
                className="field-select"
                value={settings.dcId}
                onChange={(event) => handleSettingsChange('dcId', event.target.value)}
              >
                {WAREHOUSES.map((warehouse) => (
                  <option key={warehouse.dcId} value={warehouse.dcId}>
                    {`${warehouse.label} - ${warehouse.dcId}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Month</span>
              <input
                type="month"
                value={settings.monthValue}
                onChange={(event) => handleSettingsChange('monthValue', event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="panel stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">2. Customer</p>
              <h2>Auto-fetched customer list</h2>
            </div>
            <div className="status-pill">
              {isLoadingCustomers ? 'Loading customers...' : `${availableCustomers.length} customers`}
            </div>
          </div>

          <label className="field">
            <span>Select customer</span>
            <select
              className="field-select"
              value={selectedCustomerIdSafe}
              onChange={(event) => {
                setSelectedCustomerId(event.target.value)
                setSelectedDayKey('')
                clearUploadDraft()
              }}
              disabled={!availableCustomers.length}
            >
              <option value="">Choose customer</option>
              {availableCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.id})
                </option>
              ))}
            </select>
          </label>

          {selectedCustomer ? (
            <div className="detail-card">
              <p className="detail-label">Selected customer</p>
              <strong>{selectedCustomer.name}</strong>
              <span>Customer ID: {selectedCustomer.id}</span>
            </div>
          ) : (
            <p className="muted-box">
              Select a warehouse to load the matching customer list automatically.
            </p>
          )}

          <div className="summary-strip">
            <div className="summary-item">
              <strong>{Object.keys(effectiveVisitsByDay).length}</strong>
              <span>visit days fetched</span>
            </div>
            <div className="summary-item">
              <strong>{isLoadingVisits ? '...' : selectedVisit?.visitId || '--'}</strong>
              <span>
                {selectedDayVisits.length > 1
                  ? `${selectedDayVisits.length} visits on selected day`
                  : 'selected day visit ID'}
              </span>
            </div>
            <div className="summary-item">
              <strong>{isLoadingVisits ? '...' : selectedDeliveryRequestId || '--'}</strong>
              <span>delivery target ID</span>
            </div>
          </div>

        </div>
      </section>

      <section className="panel workflow-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">3. Upload Flow</p>
            <h2>Select a day with available visit and upload the image</h2>
          </div>
          <div className="status-pill">
            {isLoadingVisits ? 'Loading visits...' : selectedCustomer ? `${selectedCustomer.name} selected` : 'No customer selected'}
          </div>
        </div>

        <div className="day-grid">
          {days.map((day) => {
            const availableDayVisits = effectiveVisitsByDay[day.key] ?? []
            const availableVisit = availableDayVisits[0]
            const uploaded = selectedCustomer ? uploadLog[selectedCustomer.id]?.[day.key] : null

            return (
              <button
                key={day.key}
                type="button"
                className={`day-button ${day.key === selectedDayKeySafe ? 'day-button--active' : ''} ${
                  uploaded ? 'day-button--uploaded' : ''
                } ${availableVisit ? 'day-button--available' : 'day-button--empty'}`}
                onClick={() => {
                  setSelectedDayKey(day.key)
                  clearUploadDraft()
                }}
              >
                <span>{day.day}</span>
                <small>{day.label}</small>
                <small>
                  {availableVisit
                    ? availableDayVisits.length > 1
                      ? `${availableDayVisits.length} visits`
                      : `Visit ${availableVisit.visitId}`
                    : 'No visit'}
                </small>
              </button>
            )
          })}
        </div>

        <div className="upload-layout">
          <div className="stack">
            <div className="detail-card">
              <p className="detail-label">Selected slot</p>
              <strong>{selectedDay ? selectedDay.key : 'Choose a day'}</strong>
              <span>{selectedCustomer ? selectedCustomer.name : 'Select customer first'}</span>
              <span>{selectedVisit ? `Visit ID: ${selectedVisit.visitId}` : 'No visit available on this day'}</span>
              <span>
                {selectedDeliveryRequestId
                  ? `Delivery request ID: ${selectedDeliveryRequestId}`
                  : 'No delivery request available on this day'}
              </span>
              <span>
                {selectedDeliveryRequestNumber
                  ? `Delivery request number: ${selectedDeliveryRequestNumber}`
                  : 'Delivery request number not available'}
              </span>
              <span>{selectedVisit ? `Upload target: DELIVERY / ${selectedDeliveryRequestId || '--'}` : 'Upload target pending'}</span>
              {selectedDayVisits.length > 1 ? (
                <span>{`${selectedDayVisits.length} visits found. The first visit will be used for upload.`}</span>
              ) : null}
            </div>

            <div className="capture-section">
              <div className="capture-actions">
                <label className="ghost-button capture-button capture-label">
                  Upload from gallery
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="ghost-button capture-button capture-label">
                  Open camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Challan number</span>
                <input
                  type="text"
                  value={challanNumber}
                  onChange={(event) => setChallanNumber(event.target.value)}
                  placeholder="Enter challan number"
                />
              </label>

              <div className="upload-dropzone">
                <span>{selectedFile ? selectedFile.name : 'Choose a delivery challan image'}</span>
                <small>
                  {selectedVisit
                    ? `The selected image will be uploaded for visit ${selectedVisit.visitId} and linked to delivery request ${selectedDeliveryRequestId || '--'}.`
                    : 'Choose a day that has an available visit first.'}
                </small>
              </div>
            </div>

            <button
              className="ghost-button"
              type="button"
              onClick={handleAutofillFromOcr}
              disabled={isAutofilling || !selectedVisit || !selectedDeliveryRequestId || !selectedFile}
            >
              {isAutofilling ? 'Autofilling...' : 'Autofill from OCR'}
            </button>

            <button
              className="primary-button"
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !selectedVisit || !selectedFile || !challanNumber.trim()}
            >
              {isUploading ? 'Submitting...' : 'Confirm and submit'}
            </button>

            {message ? <p className="feedback feedback--success">{message}</p> : null}
            {error ? <p className="feedback feedback--error">{error}</p> : null}
          </div>

          <div className="preview-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Preview</p>
                <h2>Before confirm</h2>
              </div>
            </div>

            {previewUrl ? (
              <img className="preview-image" src={previewUrl} alt="Delivery challan preview" />
            ) : (
              <div className="preview-placeholder">
                Select a visit day and image to preview the delivery challan here.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
