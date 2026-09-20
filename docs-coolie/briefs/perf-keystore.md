# Task: Phase D — performance (FlashList) + release keystore re-sign

## Branches
- Part A performance: release/0.4.0
- Part B keystore + 0.3.4 publish: main

## Part A (release/0.4.0)
Install @shopify/flash-list (compatible with RN 0.74+). Replace FlatList in:
- clients/expo/src/screens/tasks/TasksScreen.tsx
- clients/expo/src/screens/tasks/TaskDetailScreen.tsx (comments)
- clients/expo/src/screens/ArtifactsScreen.tsx
- clients/expo/src/screens/AgentsScreen.tsx
- clients/expo/src/screens/ontology/OntologyDomainListScreen.tsx

Use estimatedItemSize where predictable. React.memo row components. Same scroll behavior.

## Part B (main branch)
1. cd clients/expo/android/app && keytool -genkeypair -v -keystore release.keystore -alias coolie-release -keyalg RSA -keysize 4096 -validity 10000 -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" -dname "CN=Coolie Release,O=Xiaobin Tech,C=CN"
2. Add signingConfigs.release in android/app/build.gradle pointing at release.keystore; passwords in gradle.properties (gitignored).
3. Wire to release build type.
4. Sign current local release build, upload cos://gzbucket/coolie/app/0.3.4/coolie-release.apk with no_proxy=.myqcloud.com.
5. Copy keystore to production: scp to tc-coolie-claw:/opt/coolie/release.keystore, sudo chown ubuntu:ubuntu.
6. version.json versionCode 304, releaseNotes "release keystore signing".

## Acceptance
- Part A: tsc 0 errors; commit "perf(expo): phase D FlashList".
- Part B: commit "chore(release): signed release keystore + 0.3.4 rebuild". Then publish.
- Do NOT commit .keystore file.
- Output: file list + APK URL + version.json content.
