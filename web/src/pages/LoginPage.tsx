import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import axios from 'axios'
import { api, setTokens } from '../lib/api'
import type { ApiErrors } from '../lib/types'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<ApiErrors>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setSubmitting(true)

    try {
      const response = await api.post('auth/login/', { email, password })
      setTokens(response.data.tokens)
      void navigate('/dashboard')
    } catch (err) {
      if (axios.isAxiosError<ApiErrors>(err) && err.response?.status === 400 && err.response.data) {
        setErrors(err.response.data)
      } else {
        setErrors({ non_field_errors: ['An unexpected error occurred. Please try again.'] })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Sign In</h1>

      {errors.non_field_errors?.map((msg) => (
        <p key={msg} style={{ color: 'red' }}>{msg}</p>
      ))}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{ width: '100%', padding: 8 }}
          />
          {errors.email?.map((msg) => (
            <p key={msg} style={{ color: 'red', margin: '4px 0 0' }}>{msg}</p>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ width: '100%', padding: 8 }}
          />
          {errors.password?.map((msg) => (
            <p key={msg} style={{ color: 'red', margin: '4px 0 0' }}>{msg}</p>
          ))}
        </div>

        <button type="submit" disabled={submitting} style={{ padding: '8px 24px' }}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Don&apos;t have an account? <Link to="/register">Create one</Link>
      </p>
    </div>
  )
}
