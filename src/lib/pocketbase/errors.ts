import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message
    }
    return error instanceof Error ? error.message : 'Erro inesperado.'
  }
  if (error.status === 429) {
    return '429 Too Many Requests (Rate limit atingido no backend)'
  }
  const data = error.response?.data
  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === 'object' && 'message' in val) {
        fieldDetails.push(`${key}: ${(val as { message: string }).message}`)
      } else if (typeof val === 'string') {
        fieldDetails.push(`${key}: ${val}`)
      }
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }
  if (error.response?.message) {
    return error.response.message
  }
  return error.message || `Erro HTTP ${error.status}`
}
