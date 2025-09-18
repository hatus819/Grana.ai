import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_BASE_URL = 'http://localhost:8000/api/v1';

interface Transaction {
  id: number;
  amount: number;
  description: string;
  date: string;
  category: {
    name: string;
    color: string;
  } | null;
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
    } else {
      setAccessToken(token);
    }
  }, [navigate]);

  const { data: transactions, isLoading } = useQuery(
    'transactions',
    () =>
      axios.get<{ results: Transaction[] }>(`${API_BASE_URL}/transactions/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    {
      enabled: !!accessToken,
    }
  );

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    navigate('/login');
  };

  const totalBalance = transactions?.data.results.reduce((sum, t) => sum + t.amount, 0) || 0;
  const income = transactions?.data.results.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0) || 0;
  const expenses = transactions?.data.results.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0) || 0;

  // Prepare chart data
  const chartData = [
    { name: 'Receitas', value: income },
    { name: 'Despesas', value: Math.abs(expenses) },
  ];

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Grana.AI</h1>
        <button onClick={handleLogout} className="logout-btn">Sair</button>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Saldo Total</h3>
          <p className={totalBalance >= 0 ? 'positive' : 'negative'}>
            R$ {totalBalance.toFixed(2)}
          </p>
        </div>
        <div className="stat-card">
          <h3>Receitas</h3>
          <p className="positive">R$ {income.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h3>Despesas</h3>
          <p className="negative">R$ {Math.abs(expenses).toFixed(2)}</p>
        </div>
      </div>

      <div className="chart-container">
        <h2>Visão Geral</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `R$ ${value}`} />
            <Bar dataKey="value" fill="#007bff" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="transactions-section">
        <h2>Transações Recentes</h2>
        {isLoading ? (
          <p>Carregando...</p>
        ) : (
          <div className="transactions-list">
            {transactions?.data.results.slice(0, 10).map((transaction) => (
              <div key={transaction.id} className="transaction-item">
                <div className="transaction-info">
                  <p className="transaction-description">{transaction.description}</p>
                  <p className="transaction-date">
                    {new Date(transaction.date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="transaction-amount">
                  <p className={transaction.amount < 0 ? 'negative' : 'positive'}>
                    R$ {transaction.amount.toFixed(2)}
                  </p>
                  {transaction.category && (
                    <span
                      className="transaction-category"
                      style={{ backgroundColor: transaction.category.color }}
                    >
                      {transaction.category.name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
