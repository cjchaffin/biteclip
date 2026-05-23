# Windows Signing Plan

Last updated: 2026-05-23

## Goal

Make BiteClip and future Windows Electron apps safer and more trusted for users who download installers from GitHub Releases.

## Reality Check

Signing improves trust, verifies publisher identity, and prevents tampering warnings, but it does not guarantee that Microsoft SmartScreen will disappear immediately. SmartScreen reputation builds over time based on publisher reputation and file/download reputation.

Microsoft Store distribution is the cleanest path for non-technical users because Microsoft re-signs Store packages and Store-installed apps avoid the normal browser/download SmartScreen flow.

## Recommended Path

1. Keep GitHub Releases for direct downloads.
2. Use Azure Artifact Signing Basic for signed GitHub Release installers.
3. Consider Microsoft Store/MSIX later if BiteClip becomes broadly public-facing.
4. Do not buy an EV certificate solely for SmartScreen; Microsoft says EV no longer provides the old instant SmartScreen bypass.
5. Reuse the same signing identity across BiteClip and future apps so reputation can build.

## Option 1: Microsoft Store / MSIX

Best trust path for normal users.

- Cost: Microsoft Partner Center onboarding currently has no registration fee for individual or company accounts.
- Signing: Microsoft re-signs submitted MSIX packages.
- SmartScreen: Best expected result; Store-installed apps should not show the same SmartScreen download warning.
- Fit: Good if the app can be packaged as MSIX and Store policies fit the app.
- Setup:
  1. Create a developer account at https://storedeveloper.microsoft.com.
  2. Verify identity in Partner Center.
  3. Package the app as MSIX.
  4. Submit through Partner Center.

Docs:

- https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path

## Option 2: Azure Artifact Signing

Best path for GitHub Releases and future direct-download apps.

- Cost: Basic is about $9.99/month, includes 5,000 signatures/month, then about $0.005/signature. Premium is about $99.99/month with higher volume.
- Eligibility: Public trust signing supports individual developers in the USA and Canada, and organizations in the USA, Canada, EU, and UK.
- Identity validation: Individual validation needs legal name, primary email, address matching government ID, and supporting documents like utility bill or bank statement. Validation can take 1 to 20 business days.
- SmartScreen: Better than unsigned because publisher identity is shown and reputation can build, but new apps may still warn at first.
- CI/CD: Designed for GitHub Actions through OIDC, `azure/login`, and `azure/artifact-signing-action`.

Setup:

1. Create or use an Azure subscription.
2. Register the `Microsoft.CodeSigning` resource provider.
3. Create an Artifact Signing account on the Basic SKU.
4. Assign yourself `Artifact Signing Identity Verifier` if needed.
5. Create an Individual / Public identity validation request.
6. Complete identity verification.
7. After approval, create a Public Trust certificate profile.
8. Create a Microsoft Entra app registration for GitHub Actions.
9. Add GitHub OIDC federated credentials scoped to this repo and release tags.
10. Assign the app registration `Artifact Signing Certificate Profile Signer` on the certificate profile.
11. Add GitHub repository variables or secrets:
    - `AZURE_CLIENT_ID`
    - `AZURE_TENANT_ID`
    - `AZURE_SUBSCRIPTION_ID`
    - signing account name
    - certificate profile name
12. Sign release artifacts in a tag-only GitHub Actions workflow.
13. Timestamp signatures with Microsoft's RFC3161 timestamp server.
14. Upload signed artifacts to GitHub Releases.

Docs:

- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- https://learn.microsoft.com/en-us/azure/artifact-signing/faq
- https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku
- https://github.com/Azure/artifact-signing-action
- https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect

## Option 3: OV / IV / EV Code Signing Certificates

Fallback if Azure validation fails or you want a non-Microsoft CA.

- Rough cost: OV often around $150-$300/year in Microsoft docs, but real vendor pricing can be higher.
- Examples seen during research: DigiCert around $696-$996/year depending on token/cloud setup; Sectigo around $431/year advertised starting price.
- Since CA/B Forum changes, keys generally need a hardware token, HSM, or cloud signing service.
- USB-token workflows are awkward for GitHub-hosted runners.
- SmartScreen: Not clearly better than Azure for a new indie app in 2026.
- EV is not recommended solely for SmartScreen.

Vendor references:

- https://www.digicert.com/signing/compare-code-signing-certificates
- https://www.sectigo.com/signing-certificates
- https://www.ssl.com/code-signing-certificates/ev-code-signing/buy-2/

## GitHub Actions Shape For Azure Signing

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: actions/checkout@v5

  - name: Build Electron app
    run: npm ci && npm run dist:win

  - name: Azure login
    uses: azure/login@v3
    with:
      client-id: ${{ secrets.AZURE_CLIENT_ID }}
      tenant-id: ${{ secrets.AZURE_TENANT_ID }}
      subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

  - name: Sign Windows artifacts
    uses: azure/artifact-signing-action@v2
    with:
      endpoint: https://eus.codesigning.azure.net/
      signing-account-name: YOUR_SIGNING_ACCOUNT
      certificate-profile-name: YOUR_CERT_PROFILE
      files-folder: ${{ github.workspace }}\release
      files-folder-filter: exe,dll,msix
      files-folder-recurse: true
      file-digest: SHA256
      timestamp-rfc3161: http://timestamp.acs.microsoft.com
      timestamp-digest: SHA256
```

## Expected User Experience

- Unsigned GitHub download: strongest warnings, unknown publisher.
- Azure/OV/EV signed GitHub download: publisher identity shown, tamper protection, but possible SmartScreen warnings until reputation builds.
- Microsoft Store MSIX: best user trust path, Microsoft-signed install route.

## BiteClip Next Steps

1. Keep `v0.1.1` as the current unsigned updater-enabled release.
2. Set up Azure Artifact Signing Basic if eligible.
3. Add a tag-only GitHub Actions release workflow.
4. Publish `v0.1.2` as the first signed GitHub Release.
5. Consider an MSIX/Microsoft Store channel later if the app gets broader use.
