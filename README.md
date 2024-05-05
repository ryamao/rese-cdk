# rese-cdk

## 概要

「[Rese](https://github.com/ryamao/rese-local)」は Web ベースの飲食店予約サービスです。
このリポジトリはステージング環境構築用の CDK プロジェクトです。

## 他のリポジトリ

- ローカル環境: https://github.com/ryamao/rese-local
- フロントエンド: https://github.com/ryamao/rese-frontend
- バックエンド: https://github.com/ryamao/rese-backend

## 使用技術

| パッケージ名              | バージョン | 説明                         |
| ------------------------- | ---------- | ---------------------------- |
| typescript | 5.4.x | 開発言語 |
| aws-cdk | 2.x | IaC フレームワーク |

## 環境構築

1. プロジェクトのリポジトリをクローンしてください。

```shell-session
git clone --recursive https://github.com/ryamao/rese-cdk.git
```

2. フロントエンドの環境設定ファイルを作成してください。

```shell-session
cp .env.frontend.example rese-frontend/.env.local
```

環境設定ファイルの以下の項目に値を設定してください。

| 変数名 | 説明 |
|---|---|
| VITE_API_URL | バックエンドの URL |
| VITE_STRIPE_PUBLIC_KEY | Stripe の公開キー |

3. CDK プロジェクトの環境設定ファイルを作成してください。

```shell-session
cp .env.local.example .env.local
```

| 変数名 | 説明 |
|---|---|
| AWS_ACCOUNT_ID | AWS のアカウント ID |
| AWS_ACCESS_KEY_ID | AWS のアクセスキー ID |
| AWS_SECRET_ACCESS_KEY | AWS のシークレットアクセスキー |
| DOMAIN_NAME | アプリのドメイン名 |
| FRONTEND_FQDN | フロントエンドの完全修飾ドメイン名 |
| BACKEND_FQDN | バックエンドの完全修飾ドメイン名 |
| ADMIN_EMAIL | 管理者アカウントのメールアドレス |
| ADMIN_PASSWORD | 管理者アカウントのパスワード |
| STRIPE_KEY | Stripe の公開可能キー |
| STRIPE_SECRET | Stripe のシークレットキー |
| STRIPE_WEBHOOK_SECRET | Stripe Webhook のシークレットキー |

4. フロントエンドをビルドしてください。

```shell-session
cd rese-frontend
npm ci
npm run build
cd ..
```

5. CDK プロジェクトのパッケージをインストールしてください。

```shell-session
npm ci
```

6. AWS CLI にログインしてください。

7. デプロイを実行してください。

```shell-session
cdk bootstrap
cdk deploy --all
```
