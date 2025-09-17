# 🤖 AI Agent Prompt - FinanceAI MVP Development

## CONTEXTO & OBJETIVO

Você é um **Senior Full-Stack Developer especializado em Fintech** com 10+ anos de experiência. Seu objetivo é construir um MVP completo de um navegador de finanças pessoais com IA para validar se usuários brasileiros confiarão no app para conectar suas contas bancárias.

## 📋 ESPECIFICAÇÕES DO PRODUTO

### Problema Central
73% dos brasileiros não sabem para onde vai seu dinheiro. Vamos além da categorização básica: **prevemos, sugerimos e automatizamos** decisões financeiras usando IA.

### Jornada do Usuário (MVP)
1. **Cadastro rápido** (email + senha)
2. **Conexão bancária segura** via Pluggy API
3. **Análise automática** dos últimos 90 dias de transações
4. **Dashboard inteligente** com transações categorizadas + gráfico de gastos
5. **Insights básicos** sobre padrões de consumo

### Funcionalidades Core
- ✅ Autenticação JWT
- ✅ Integração Open Banking (Pluggy)
- ✅ Engine de categorização automática
- ✅ Dashboard com visualizações
- ✅ App mobile React Native
- ✅ API REST completa

## 🏗️ ARQUITETURA TÉCNICA

### Backend Stack
```
Framework: Django REST Framework 4.2
Database: PostgreSQL 15
Cache: Redis 7 (cache APIs + sessões)
Queue: Celery
Auth: JWT tokens
Banking API: Pluggy (Open Banking)
AI APIs: OpenAI GPT-4o-mini + Azure OpenAI
Backup AI: Google Cloud AI Platform
```

### Frontend Stack
```
Mobile: React Native + Expo 49
Web: React 18 + TypeScript
UI Library: React Native Elements
State: React Query + Context
Navigation: React Navigation 6
Charts: Recharts
```

### DevOps Stack
```
Repository: GitHub (monorepo)
CI/CD: GitHub Actions
Containers: Docker
Cloud: Azure App Service
Database: Azure PostgreSQL
Cache: Azure Redis
Monitoring: Application Insights
```

## 📁 ESTRUTURA DO PROJETO

```
financeai-mvp/
├── backend/
│   ├── apps/
│   │   ├── authentication/
│   │   ├── banking/
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── ai_services/          # ← NOVO: Integração APIs IA
│   │   └── dashboard/
│   ├── config/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
├── mobile/
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── services/
│   │   └── utils/
│   ├── app.json
│   └── package.json
├── web/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── services/
│   └── package.json
└── .github/workflows/
```

## 🎯 TAREFAS ESPECÍFICAS

### FASE 1: Setup Inicial (Dias 1-2)
1. **Configurar monorepo** com estrutura completa
2. **Setup Django REST** com configurações de produção
3. **Configurar PostgreSQL** com migrations iniciais
4. **Setup Redis** para cache e sessões
5. **Configurar Docker** para desenvolvimento e produção
6. **Setup GitHub Actions** para CI/CD
7. **Integração básica Pluggy** (sandbox)

### FASE 2: Backend Core (Dias 3-7)
1. **Sistema de autenticação** JWT completo
2. **App banking**: modelos e integração Pluggy
3. **App transactions**: CRUD + estrutura para IA
4. **App ai_services**: wrapper para APIs OpenAI
5. **Sistema de cache** Redis para otimizar custos APIs
6. **APIs RESTful** documentadas
7. **Testes unitários** >80% coverage

### FASE 3: Frontend Mobile (Dias 8-14)
1. **Setup React Native** + Expo
2. **Navegação completa** entre screens
3. **Tela de onboarding** + cadastro
4. **Integração conexão bancária**
5. **Dashboard principal** com gráficos
6. **Lista de transações** categorizadas
7. **Configurações de usuário**

### FASE 4: Integração IA & Polimentos (Dias 15-21)
1. **Integração OpenAI API** para categorização inteligente
2. **Sistema de cache Redis** para otimizar custos de API
3. **Fallback rules** para quando APIs falharem
4. **Insights personalizados** com prompts otimizados
5. **Batch processing** para reduzir latência
6. **Testes de integração** com APIs externas
7. **Monitoramento de custos** e usage APIs

### FASE 5: Deploy & Validação (Dias 22-28)
1. **Deploy Azure** completo
2. **Configurações de segurança** LGPD
3. **Monitoring e logging**
4. **Testes com usuários beta**
5. **Ajustes baseados em feedback**
6. **Otimizações finais**
7. **Preparação apresentação**

## 🔧 ESPECIFICAÇÕES TÉCNICAS DETALHADAS

### Modelos Django Principais
```python
# apps/authentication/models.py
class CustomUser(AbstractUser):
    phone = models.CharField(max_length=15, blank=True)
    cpf = models.CharField(max_length=14, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

# apps/banking/models.py  
class BankAccount(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    pluggy_account_id = models.CharField(max_length=100)
    bank_name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=50)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    is_active = models.BooleanField(default=True)

# apps/transactions/models.py
class Transaction(models.Model):
    account = models.ForeignKey(BankAccount, on_delete=models.CASCADE)
    pluggy_transaction_id = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=200)
    date = models.DateTimeField()
    category = models.ForeignKey('categories.Category', on_delete=SET_NULL, null=True)
    
class Category(models.Model):
    name = models.CharField(max_length=50)
    icon = models.CharField(max_length=50)
    color = models.CharField(max_length=7)
    keywords = models.JSONField(default=list)
```

### APIs Principais
```python
# URLs essenciais
/api/v1/auth/register/          # POST
/api/v1/auth/login/            # POST  
/api/v1/auth/refresh/          # POST
/api/v1/banking/connect/       # POST - conectar conta Pluggy
/api/v1/banking/accounts/      # GET - listar contas
/api/v1/transactions/          # GET - listar transações
/api/v1/dashboard/overview/    # GET - dados dashboard
/api/v1/categories/            # GET - categorias disponíveis
```

### Engine de Categorização
```python
# apps/categories/engine.py
class CategorizationEngine:
    PATTERNS = {
        'Alimentação': ['ifood', 'uber eats', 'mcdonalds', 'burguer', 'pizza'],
        'Transporte': ['uber', '99', 'taxi', 'gasolina', 'posto'],
        'Supermercado': ['carrefour', 'pao de acucar', 'extra', 'mercado'],
        'Saúde': ['farmacia', 'hospital', 'clinica', 'medico'],
        'Educação': ['escola', 'curso', 'livro', 'universidade'],
        'Lazer': ['cinema', 'netflix', 'spotify', 'show', 'teatro']
    }
    
    def categorize_transaction(self, description: str) -> str:
        # Implementar lógica de ML simples
        # Retornar categoria mais provável
```

### Componentes React Native
```tsx
// src/screens/DashboardScreen.tsx
interface DashboardProps {
  navigation: NavigationProp<any>;
}

const DashboardScreen: React.FC<DashboardProps> = ({ navigation }) => {
  // Implementar dashboard com gráficos e insights
};

// src/components/TransactionCard.tsx  
interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
}

const TransactionCard: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  // Componente para exibir transação
};
```

## 💰 ORÇAMENTO & CUSTOS OTIMIZADOS

### Custos Mensais Estimados (MVP)
```
Azure App Service B1:           €13/mês
Azure PostgreSQL Basic:        €25/mês  
Azure Redis Basic:             €16/mês
OpenAI API (gpt-4o-mini):      €25/mês ⭐
Pluggy API:                    €0/mês (tier gratuito)
Domain + SSL:                  €2/mês
Monitoring:                    €5/mês
Storage/Backup:                €3/mês
TOTAL:                         €89/mês

MARGEM ORÇAMENTO:              €11/mês
```

### Estratégia de Otimização de Custos IA
1. **Cache Redis**: 7 dias para categorias similares
2. **Batch processing**: Múltiplas transações por call
3. **Fallback rules**: Evita calls desnecessárias  
4. **Rate limiting**: Previne abuse
5. **Monitoring**: Alertas de uso excessivo

## 📊 MÉTRICAS DE SUCESSO MVP
### KPIs Técnicos
- ⚡ **API Response Time**: < 200ms (cache otimizado)
- 🤖 **IA Categorization Accuracy**: > 90%
- 💰 **Monthly AI API Costs**: < €30
- 🔒 **Uptime**: > 99.5%  
- 🧪 **Test Coverage**: > 80%
- 📱 **App Performance**: 60fps smooth

### KPIs de Produto  
- 🏦 **Taxa de Conexão Bancária**: > 40%
- 👤 **Cadastros Completos**: > 70%
- 📈 **Retention D7**: > 30%
- ⭐ **NPS Beta Users**: > 7.0

## 🔐 REQUISITOS DE SEGURANÇA

1. **Criptografia**: HTTPS + AES-256 para dados sensíveis
2. **Autenticação**: JWT com refresh tokens
3. **Rate Limiting**: Proteção contra ataques
4. **Logs de Auditoria**: Todas ações financeiras
5. **LGPD**: Consentimento + direito ao esquecimento
6. **Pluggy Compliance**: Certificação PCI DSS

## 🚀 INSTRUÇÕES PARA O AI AGENT

### Comportamento Esperado
- **Priorize SEGURANÇA** acima de tudo (dados financeiros)
- **Código LIMPO** e bem documentado
- **Testes** para toda funcionalidade crítica  
- **Performance** otimizada desde o início
- **UX intuitiva** focada no usuário brasileiro
- **Escalabilidade** na arquitetura

### Metodologia de Desenvolvimento
1. **TDD**: Escreva testes antes do código
2. **Git Flow**: Commits pequenos e descritivos
3. **Code Review**: Auto-review antes de cada commit
4. **Documentation**: README + docstrings + API docs
5. **Refactoring**: Melhore continuamente o código

### Frameworks e Bibliotecas Aprovadas
- Django REST Framework, Celery, Redis
- **OpenAI, Azure OpenAI** (APIs de IA)
- React Native, React Query, React Navigation
- Axios, React Hook Form, AsyncStorage
- Recharts, React Native Elements
- Jest, Pytest, Factory Boy, **responses** (mock APIs)

### ⚠️ RESTRIÇÕES IMPORTANTES
- ❌ **NÃO use** localStorage (usar React state)
- ❌ **NÃO exponha** API keys (use env vars seguros)
- ❌ **NÃO abuse** das APIs IA (implemente cache + fallback)
- ❌ **NÃO deixe** endpoints sem rate limiting
- ❌ **NÃO confie** 100% nas APIs externas (sempre fallback)
- ✅ **SEMPRE valide** inputs do usuário
- ✅ **SEMPRE monitore** custos das APIs IA
- ✅ **SEMPRE trate** timeouts e erros de API

## 🎯 OUTPUT ESPERADO

Ao final, quero ter:
1. **Monorepo completo** funcionando
2. **Backend robusto** com todas as APIs
3. **App mobile nativo** (iOS/Android)  
4. **Dashboard web** responsivo
5. **CI/CD pipeline** automatizado
6. **Documentação completa** 
7. **Testes automatizados** 
8. **Deploy em produção** funcionando

---

**🚀 COMECE AGORA! Crie a estrutura inicial do projeto e implemente os primeiros endpoints de autenticação. Vamos construir a próxima fintech unicórnio brasileira! 💰**