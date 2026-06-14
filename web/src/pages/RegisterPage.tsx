import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import axios from 'axios'
import { api, setTokens } from '../lib/api'
import type { ApiErrors } from '../lib/types'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [phone, setPhone] = useState('')
  const [cpf, setCpf] = useState('')
  const [errors, setErrors] = useState<ApiErrors>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setSubmitting(true)

    // Build body — omit phone/cpf when blank
    const body: Record<string, string> = {
      email,
      password,
      password_confirm: passwordConfirm,
    }
    if (phone.trim()) body.phone = phone.trim()
    if (cpf.trim()) body.cpf = cpf.trim()

    try {
      const response = await api.post('auth/register/', body)
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
      <h1>Create Account</h1>

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
            autoComplete="new-password"
            style={{ width: '100%', padding: 8 }}
          />
          {errors.password?.map((msg) => (
            <p key={msg} style={{ color: 'red', margin: '4px 0 0' }}>{msg}</p>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password_confirm">Confirm Password</label>
          <br />
          <input
            id="password_confirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            style={{ width: '100%', padding: 8 }}
          />
          {errors.password_confirm?.map((msg) => (
            <p key={msg} style={{ color: 'red', margin: '4px 0 0' }}>{msg}</p>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="phone">Phone (optional)</label>
          <br />
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            style={{ width: '100%', padding: 8 }}
          />
          {errors.phone?.map((msg) => (
            <p key={msg} style={{ color: 'red', margin: '4px 0 0' }}>{msg}</p>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="cpf">CPF (optional)</label>
          <br />
          <input
            id="cpf"
            type="text"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            autoComplete="off"
            style={{ width: '100%', padding: 8 }}
          />
          {errors.cpf?.map((msg) => (
            <p key={msg} style={{ color: 'red', margin: '4px 0 0' }}>{msg}</p>
          ))}
        </div>

        <button type="submit" disabled={submitting} style={{ padding: '8px 24px' }}>
          {submitting ? 'Creating account…' : 'Sign Up'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
