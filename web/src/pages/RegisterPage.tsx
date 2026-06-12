import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from 'react-query';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');

  const registerMutation = useMutation(
    (data: { email: string; password: string; password_confirm: string; phone: string; cpf: string }) =>
      axios.post(`${API_BASE_URL}/auth/register/`, data),
    {
      onSuccess: () => {
        alert('Conta criada com sucesso!');
        navigate('/login');
      },
      onError: (error: any) => {
        const errors = error.response?.data || {};
        const errorMessage = Object.values(errors).flat().join('\n');
        alert(errorMessage || 'Erro ao criar conta');
      },
    }
  );

  const handleRegister = () => {
    if (!email || !password || !passwordConfirm) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }
    if (password !== passwordConfirm) {
      alert('As senhas não coincidem');
      return;
    }
    registerMutation.mutate({ email, password, password_confirm: passwordConfirm, phone, cpf });
  };

  return (
    <div className="register-container">
      <h1>Grana.AI</h1>
      <h2>Cadastro</h2>
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
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="Confirmar Senha"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
        autoComplete="new-password"
      />
      <input
        type="tel"
        placeholder="Telefone (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        type="text"
        placeholder="CPF (opcional)"
        value={cpf}
        onChange={(e) => setCpf(e.target.value)}
      />
      <button onClick={handleRegister} disabled={registerMutation.isLoading}>
        {registerMutation.isLoading ? 'Criando conta...' : 'Cadastrar'}
      </button>
      <p>
        Já tem conta? <a href="/login">Faça login</a>
      </p>
    </div>
  );
};

export default RegisterPage;
