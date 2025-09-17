import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useMutation } from 'react-query';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

interface RegisterResponse {
  user: {
    id: number;
    username: string;
    email: string;
    phone: string;
    cpf: string;
  };
  tokens: {
    refresh: string;
    access: string;
  };
}

const RegisterScreen = ({ navigation }: any) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');

  const registerMutation = useMutation(
    (data: { username: string; email: string; password: string; password_confirm: string; phone: string; cpf: string }) =>
      axios.post<RegisterResponse>(`${API_BASE_URL}/auth/register/`, data),
    {
      onSuccess: () => {
        Alert.alert('Sucesso', 'Conta criada com sucesso!', [
          { text: 'OK', onPress: () => navigation.navigate('Login') }
        ]);
      },
      onError: (error: any) => {
        const errors = error.response?.data || {};
        const errorMessage = Object.values(errors).flat().join('\n');
        Alert.alert('Erro', errorMessage || 'Erro ao criar conta');
      },
    }
  );

  const handleRegister = () => {
    if (!username || !email || !password || !passwordConfirm) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Erro', 'As senhas não coincidem');
      return;
    }
    registerMutation.mutate({ username, email, password, password_confirm: passwordConfirm, phone, cpf });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Grana.AI</Text>
      <Text style={styles.subtitle}>Cadastro</Text>

      <TextInput
        style={styles.input}
        placeholder="Usuário"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Telefone (opcional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <TextInput
        style={styles.input}
        placeholder="CPF (opcional)"
        value={cpf}
        onChangeText={setCpf}
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        placeholder="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Confirmar Senha"
        value={passwordConfirm}
        onChangeText={setPasswordConfirm}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={registerMutation.isLoading}>
        <Text style={styles.buttonText}>
          {registerMutation.isLoading ? 'Criando conta...' : 'Cadastrar'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Já tem conta? Faça login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 50,
    color: '#333',
  },
  subtitle: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    textAlign: 'center',
    color: '#007bff',
    fontSize: 16,
  },
});

export default RegisterScreen;
