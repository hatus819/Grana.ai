import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation } from 'react-query';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://localhost:8000/api/v1';

interface LoginResponse {
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

const LoginScreen = ({ navigation }: any) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation(
    (data: { username: string; password: string }) =>
      axios.post<LoginResponse>(`${API_BASE_URL}/auth/login/`, data),
    {
      onSuccess: async (response) => {
        await AsyncStorage.setItem('accessToken', response.data.tokens.access);
        await AsyncStorage.setItem('refreshToken', response.data.tokens.refresh);
        navigation.replace('Dashboard');
      },
      onError: () => {
        Alert.alert('Erro', 'Credenciais inválidas');
      },
    }
  );

  const handleLogin = () => {
    if (!username || !password) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Grana.AI</Text>
      <Text style={styles.subtitle}>Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Usuário"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loginMutation.isLoading}>
        <Text style={styles.buttonText}>
          {loginMutation.isLoading ? 'Entrando...' : 'Entrar'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>Não tem conta? Cadastre-se</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
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
    backgroundColor: '#007bff',
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

export default LoginScreen;
