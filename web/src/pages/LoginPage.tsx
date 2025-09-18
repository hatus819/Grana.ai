import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from 'react-query';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation(
    (data: { email: string; password: string }) =>
      axios.post(`${API_BASE_URL}/auth/login/`, data),
    {
      onSuccess: (response) => {
        localStorage.setItem('accessToken', response.data.tokens.access);
        localStorage.setItem('refreshToken', response.data.tokens.refresh);
        navigate('/dashboard');
      },
      onError: () => {
        alert('Credenciais inválidas');
      },
    }
  );

  const handleLogin = () => {
    if (!email || !password) {
      alert('Preencha todos os campos');
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="login-container">
      <h1>Grana.AI</h1>
      <h2>Login</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      <button onClick={handleLogin} disabled={loginMutation.isLoading}>
        {loginMutation.isLoading ? 'Entrando...' : 'Entrar'}
      </button>
      <p>
        Não tem conta? <a href="/register">Cadastre-se</a>
      </p>
    </div>
  );
};

export default LoginPage;
