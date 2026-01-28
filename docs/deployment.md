# GitHub Pages 배포 가이드

이 문서 사이트를 GitHub Pages에 배포하는 방법을 설명합니다.

## 자동 배포 (GitHub Actions)

### 1단계: GitHub Pages 활성화

1. GitHub 저장소로 이동
2. **Settings** > **Pages** 클릭
3. **Source** 섹션에서:
   - Source: **GitHub Actions** 선택

### 2단계: 코드 Push

```bash
git add .
git commit -m "docs: Add documentation site"
git push origin main
```

### 3단계: 배포 확인

1. **Actions** 탭에서 워크플로우 실행 확인
2. 완료되면 `https://yourusername.github.io/dure/` 접속

## 수동 배포

GitHub Actions를 사용하지 않는 경우:

### 1단계: gh-pages 브랜치 생성

```bash
# gh-pages 브랜치 생성
git checkout --orphan gh-pages

# docs 폴더 내용만 유지
git rm -rf .
git add -f docs/*
mv docs/* .
rm -rf docs

# 커밋 및 Push
git commit -m "Deploy documentation"
git push origin gh-pages

# main 브랜치로 돌아가기
git checkout main
```

### 2단계: GitHub Pages 설정

1. **Settings** > **Pages**
2. **Source**: `gh-pages` 브랜치 선택
3. **Folder**: `/ (root)` 선택
4. **Save** 클릭

### 3단계: 접속

`https://yourusername.github.io/dure/`

## 커스텀 도메인 (선택)

### 1단계: 도메인 구입

예: `dure.dev`

### 2단계: DNS 설정

도메인 등록기관(GoDaddy, Namecheap 등)에서:

**A 레코드 추가:**

```
Type: A
Name: @
Value: 185.199.108.153
```

추가로 다음 IP들도:
- 185.199.109.153
- 185.199.110.153
- 185.199.111.153

**CNAME 레코드 추가 (www 서브도메인):**

```
Type: CNAME
Name: www
Value: yourusername.github.io
```

### 3단계: CNAME 파일 생성

`docs/CNAME` 파일 수정:

```
dure.dev
```

### 4단계: GitHub 설정

1. **Settings** > **Pages**
2. **Custom domain**: `dure.dev` 입력
3. **Enforce HTTPS** 체크

### 5단계: 확인

DNS 전파 대기 (최대 24시간) 후 `https://dure.dev` 접속

## 로컬 개발

문서를 로컬에서 확인하려면:

```bash
# Docsify CLI 설치
npm install -g docsify-cli

# 문서 서버 실행
docsify serve docs

# http://localhost:3000 접속
```

## 문서 업데이트

### 자동 배포 사용 시

```bash
# 문서 수정
vi docs/guide/getting-started.md

# 커밋 및 Push
git add docs/
git commit -m "docs: Update getting started guide"
git push origin main

# GitHub Actions가 자동으로 배포
```

### 수동 배포 사용 시

```bash
# main 브랜치에서 문서 수정
git add docs/
git commit -m "docs: Update getting started guide"
git push origin main

# gh-pages 브랜치로 전환
git checkout gh-pages

# main에서 docs 폴더 가져오기
git checkout main -- docs
mv docs/* .
rm -rf docs

# 커밋 및 Push
git add .
git commit -m "Deploy updated docs"
git push origin gh-pages

# main으로 돌아가기
git checkout main
```

## 문제 해결

### 404 에러

**증상:** GitHub Pages 접속 시 404

**해결:**
1. **Settings** > **Pages**에서 Source 확인
2. 브랜치가 올바른지 확인 (gh-pages 또는 main)
3. 폴더가 올바른지 확인 (root 또는 docs)

### CSS가 적용 안 됨

**증상:** 스타일이 깨짐

**해결:**

`docs/index.html`의 경로 확인:

```html
<!-- 절대 경로 사용 -->
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@4/lib/themes/vue.css">

<!-- 상대 경로는 피하기 -->
```

### 커스텀 도메인이 작동 안 함

**증상:** 커스텀 도메인 접속 안 됨

**해결:**
1. DNS 전파 대기 (최대 24시간)
2. DNS 확인:
   ```bash
   dig dure.dev
   ```
3. CNAME 파일 확인
4. GitHub Pages 설정 재확인

### 이미지가 표시 안 됨

**증상:** 이미지 404 에러

**해결:**

상대 경로 사용:

```markdown
<!-- 좋음 -->
![Architecture](../assets/architecture.png)

<!-- 나쁨 -->
![Architecture](/assets/architecture.png)
```

## 고급 설정

### Analytics 추가

Google Analytics를 추가하려면 `docs/index.html`:

```html
<script>
  window.$docsify = {
    // ... 기존 설정
    plugins: [
      function(hook, vm) {
        hook.doneEach(function() {
          if (typeof gtag === 'function') {
            gtag('config', 'G-XXXXXXXXXX', {
              'page_path': vm.route.path
            });
          }
        });
      }
    ]
  }
</script>

<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### 검색 엔진 최적화 (SEO)

`docs/index.html`의 meta 태그:

```html
<head>
  <meta charset="UTF-8">
  <title>Dure - Agentic Software Engineering</title>
  <meta name="description" content="의도를 입력하면, 네 개의 에이전트가 순차적으로 실행되고, 인간은 증거를 보고 결정만 하는 엔지니어링 시스템">
  <meta name="keywords" content="dure, ai, agents, code generation, automation">
  <meta property="og:title" content="Dure">
  <meta property="og:description" content="Agentic Software Engineering System">
  <meta property="og:image" content="https://yourusername.github.io/dure/assets/og-image.png">
  <meta property="og:url" content="https://yourusername.github.io/dure/">
  <meta name="twitter:card" content="summary_large_image">
</head>
```

### 다크 모드

Docsify는 자동으로 다크 모드를 지원합니다. 테마 선택:

```html
<!-- Light -->
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@4/lib/themes/vue.css">

<!-- Dark -->
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@4/lib/themes/dark.css">

<!-- 자동 (시스템 설정 따름) -->
<style>
  @media (prefers-color-scheme: dark) {
    /* 다크 모드 스타일 */
  }
</style>
```

## 더 알아보기

- [GitHub Pages 공식 문서](https://docs.github.com/pages)
- [Docsify 공식 문서](https://docsify.js.org/)
- [커스텀 도메인 설정](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site)
