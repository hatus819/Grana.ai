export interface ApiErrors {
  non_field_errors?: string[]
  [field: string]: string[] | undefined
}
