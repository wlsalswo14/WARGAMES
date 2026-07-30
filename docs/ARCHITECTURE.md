# 코드 구조

## 진입점과 오케스트레이션

- `src/main.ts`: 게임 인스턴스를 생성하고 실행합니다.
- `src/game/BrickWarfare.ts`: 모드 초기화, 시스템 연결, 프레임 순서와 사용자 이벤트만 조정합니다.
- `src/game/modes/PlayMode.ts`: Conquest, Challenge, Sandbox의 규칙·제약을 정의합니다.

`BrickWarfare`에 새로운 물리 계산이나 렌더링 세부 구현을 직접 추가하지 않습니다. 해당 책임의 시스템 또는 엔티티에 구현하고, 메인 클래스에서는 호출 순서와 결과 전달만 담당합니다.

## 시스템

| 파일 | 책임 |
| --- | --- |
| `systems/GameLoop.ts` | 프레임 예약과 멈춤 감시 |
| `systems/BattleCamera.ts` | God Mode 이동·회전, 빙의 시점, 1·3인칭, 폭발 카메라 |
| `systems/UnitCollisionSystem.ts` | 자폭드론 충돌, 항공기 지형 추락, 구조물 관통 방지 |
| `systems/CombatSystem.ts` | 발사체 생성·갱신, 피해와 폭발 |
| `systems/BattlefieldAI.ts` | 유닛 목표 선정과 전술 행동 |
| `systems/NavigationSystem.ts` | 구조물 회피와 이동 경로 보정 |
| `systems/ChallengeSession.ts` | 제한 시간, 점수, 승패 |
| `systems/ConquestSession.ts` | 7개 거점 정복전의 CP, 완전 장악, 승패 |
| `systems/ConquestRuntime.ts` | 정복전 세션, 지휘 능력, 예약 타격, 결과 저장 연결 |
| `systems/ProductionCatalog.ts` | 생산시설별 병과, 수입, 병력 상한 |
| `systems/ProductionNetwork.ts` | 생산시설 배치, 가동 판정, 출격 위치, AI 건설 |
| `systems/CommanderAbilitySystem.ts` | 지휘 능력 비용과 재사용 대기시간 |
| `systems/PlayerProgression.ts` | 로컬 XP, 계급, 시작 보급 보너스 |
| `systems/AdaptiveDirector.ts` | 플레이어 명령 성향 기록과 대응 목표 예측 |
| `systems/DiplomacySystem.ts` | Sandbox 진영 관계 |
| `systems/BrickBurstSystem.ts` | 블록 파편 생성·수명 관리 |
| `systems/BattleAudio.ts` | Web Audio 효과음 |

## 게임 데이터

- `config.ts`: 진영, 유닛·무기 수치와 전역 성능 한도
- `types.ts`: 진영, 유닛, 명령, 전투 결과의 공유 타입
- `battlefield/`: Conquest 7거점 전장, Challenge 고정 전장, Sandbox 절차적 전장, 본부·생산기지 구조 계획
- `entities/`: 유닛, 거점, 발사체, 파괴 가능한 구조물
- `world/BattlefieldWorld.ts`: 지형 청크, 영토, 나무, 바람
- `ui/Hud.ts`: DOM HUD 생성과 상태 표시

## 프레임 처리 순서

동작 차이를 막기 위해 다음 순서를 유지합니다.

1. 입력과 AI 명령 계산
2. 유닛 이동
3. 유닛·구조물·지형 충돌 해결
4. 구조물과 발사체 갱신
5. 거점, 자원, 외교, 본부와 승패 갱신
6. 카메라, 월드 청크, HUD, 오디오 갱신
7. WebGL 렌더링

## 변경 위치

- 조작감과 시점: `GameInput.ts`, `BattleCamera.ts`, `Unit.ts`
- 무기와 피해량: `config.ts`, `CombatSystem.ts`, `Projectile.ts`
- 장애물 회피: `NavigationSystem.ts`, `UnitCollisionSystem.ts`
- 거점·승리 규칙: `Outpost.ts`, `ChallengeSession.ts`, `ConquestSession.ts`
- 생산기지와 증원 상한: `ProductionNetwork.ts`, `ProductionCatalog.ts`, `structurePlans.ts`, `PlayMode.ts`
- 지휘 능력과 성장: `ConquestRuntime.ts`, `CommanderAbilitySystem.ts`, `PlayerProgression.ts`
- 초기 병력과 맵: `PlayMode.ts`, `battlefield/`
- 화면 표시: `Hud.ts`, `style.css`

## 검증

```bash
npm run check
npm run build
```

기능 변경 후에는 Conquest에서 `다중 선택 → 거점 점령 → 생산시설 건설 → 병력 생산 → 지휘 능력 → 직접 조종 → 결과와 XP`를 먼저 확인합니다. 이어 Challenge의 점수전과 Sandbox의 진영 전환·무한 배치를 회귀 검증합니다.
