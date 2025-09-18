import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useMutation } from 'react-query';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const BankConnectionScreen = ({ navigation }: any) => {
  const [connecting, setConnecting] = useState(false);

  const connectBankMutation = useMutation(
    () => axios.post(`${API_BASE_URL}/banking/connect/`, {}, {
      headers: { Authorization: `Bearer ${AsyncStorage.getItem('accessToken')}` }
    }),
    {
      onSuccess: () => {
        Alert.alert('Sucesso', 'Conta bancária conectada!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      },
      onError: () => {
        Alert.alert('Erro', 'Falha ao conectar conta bancária');
      },
    }
  );

  const handleConnectBank = async () => {
    setConnecting(true);
    // Simulate bank connection process
    setTimeout(() => {
      setConnecting(false);
      Alert.alert('Sucesso', 'Conta bancária conectada com sucesso!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Conectar Conta Bancária</Text>
      <Text style={styles.subtitle}>
        Conecte sua conta bancária de forma segura para importar suas transações automaticamente.
      </Text>

      <View style={styles.banksList}>
        <TouchableOpacity style={styles.bankOption} onPress={handleConnectBank} disabled={connecting}>
          <Text style={styles.bankName}>Banco do Brasil</Text>
          {connecting && <ActivityIndicator size="small" color="#007bff" />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.bankOption} onPress={handleConnectBank} disabled={connecting}>
          <Text style={styles.bankName}>Itaú</Text>
          {connecting && <ActivityIndicator size="small" color="#007bff" />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.bankOption} onPress={handleConnectBank} disabled={connecting}>
          <Text style={styles.bankName}>Santander</Text>
          {connecting && <ActivityIndicator size="small" color="#007bff" />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.bankOption} onPress={handleConnectBank} disabled={connecting}>
          <Text style={styles.bankName}>Bradesco</Text>
          {connecting && <ActivityIndicator size="small" color="#007bff" />}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.skipButton} onPress={() => navigation.goBack()}>
        <Text style={styles.skipText}>Pular por enquanto</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
    lineHeight: 24,
  },
  banksList: {
    flex: 1,
  },
  bankOption: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bankName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  skipButton: {
    marginTop: 20,
    padding: 15,
    alignItems: 'center',
  },
  skipText: {
    color: '#007bff',
    fontSize: 16,
  },
});

export default BankConnectionScreen;
