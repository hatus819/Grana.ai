# Grana.AI - Aplicativo de Finanças Pessoais com IA

## Visão Geral

Grana.AI é um aplicativo completo para gerenciamento de finanças pessoais focado no público brasileiro. Utiliza inteligência artificial para prever, sugerir e automatizar decisões financeiras, ajudando os usuários a entenderem melhor seus gastos e economizar dinheiro.

## Estrutura do Projeto

- **Backend**: API REST construída com Django REST Framework, incluindo autenticação JWT, integração com Open Banking via Pluggy, engine de categorização automática de transações usando IA, e dashboard de visualização.
- **Mobile**: Aplicativo React Native com telas para login, cadastro, conexão bancária e dashboard financeiro.
- **Web**: Dashboard web responsivo em React, com páginas para login, cadastro e visualização de transações e estatísticas financeiras.

## Como Funciona

1. **Cadastro e Autenticação**  
   Usuários se cadastram com email, senha, telefone e CPF. A autenticação é feita via JWT.

2. **Conexão Bancária Segura**  
   O app conecta-se às contas bancárias dos usuários via API Pluggy, garantindo segurança e conformidade.

3. **Análise e Categorização Automática**  
   As transações dos últimos 90 dias são analisadas e categorizadas automaticamente usando IA, com fallback para regras básicas.

4. **Dashboard Inteligente**  
   Usuários visualizam gráficos de gastos, saldo, receitas e despesas, além de insights sobre seus padrões financeiros.

## Como Rodar o Projeto

### Backend

1. Configure variáveis de ambiente, incluindo `SECRET_KEY`, `OPENAI_API_KEY`, e configurações do banco de dados.
2. Instale dependências Python:  
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Execute migrações:  
   ```bash
   python backend/manage.py migrate
   ```
4. Inicie o servidor:  
   ```bash
   python backend/manage.py runserver
   ```

### Mobile

1. Instale dependências:  
   ```bash
   cd mobile
   npm install
   ```
2. Inicie o app com Expo:  
   ```bash
   npm start
   ```

### Web

1. Instale dependências:  
   ```bash
   cd web
   npm install
   ```
2. Inicie o servidor de desenvolvimento:  
   ```bash
   npm start
   ```

## Atualizações Futuras

- Implementar testes automatizados para frontend web.
- Adicionar suporte a múltiplas contas bancárias por usuário.
- Melhorar a engine de IA com modelos mais avançados.
- Implementar notificações push no app mobile.
- Otimizar performance e escalabilidade do backend.

---

Grana.AI é um projeto em constante evolução para transformar a forma como brasileiros gerenciam suas finanças pessoais com tecnologia de ponta.
