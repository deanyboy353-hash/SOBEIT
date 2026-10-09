// Memory layout and helpers for gta_sa.exe v1.0 US (Hoodlum / compact 1.0 US exe).
// Every address in this file is for that exe only; version.cpp refuses to run on anything else.
#pragma once

#include <windows.h>
#include <cstdint>
#include <cmath>

namespace game
{
	struct Vec3
	{
		float x, y, z;
	};

	// RwMatrix / CMatrix layout: right, forward ("up" in RW terms), up ("at"), position.
	struct Matrix
	{
		Vec3  right;   uint32_t flags;
		Vec3  forward; uint32_t pad0;
		Vec3  up;      uint32_t pad1;
		Vec3  pos;     uint32_t pad2;
	};

	template <typename T> inline T &mem(uintptr_t addr) { return *reinterpret_cast<T *>(addr); }
	template <typename T> inline T &field(void *base, uintptr_t off) { return *reinterpret_cast<T *>(reinterpret_cast<uint8_t *>(base) + off); }

	// ---- globals ----------------------------------------------------------------------------
	namespace addr
	{
		constexpr uintptr_t VersionCheckUS   = 0x82457C;  // == 0x94BF on 1.0 US
		constexpr uintptr_t VersionCheckEU   = 0x8245BC;  // == 0x94BF on 1.0 EU (unsupported)
		constexpr uintptr_t D3DDevice        = 0xC97C28;  // IDirect3DDevice9 *
		constexpr uintptr_t PlayerPed        = 0xB6F5F0;  // CWorld::Players[0].m_pPed
		constexpr uintptr_t PlayerVehicle    = 0xBA18FC;  // CVehicle * the player is in, 0 on foot
		constexpr uintptr_t PlayerMoney      = 0xB7CE50;  // CWorld::Players[0].m_nMoney
		constexpr uintptr_t PlayerMoneyShown = 0xB7CE54;  // CWorld::Players[0].m_nDisplayMoney
		constexpr uintptr_t MenuActive       = 0xBA67A4;  // FrontEndMenuManager.m_bMenuActive
		constexpr uintptr_t CurrArea         = 0xB72914;  // CGame::currArea (interior)
		constexpr uintptr_t TimeScale        = 0xB7CB64;  // CTimer::ms_fTimeScale
		constexpr uintptr_t ClockHours       = 0xB70153;  // CClock::ms_nGameClockHours
		constexpr uintptr_t ClockMinutes     = 0xB70152;  // CClock::ms_nGameClockMinutes
		constexpr uintptr_t ForcedWeather    = 0xC81318;  // CWeather::ForcedWeatherType
		constexpr uintptr_t NewWeather       = 0xC8131C;  // CWeather::NewWeatherType
		constexpr uintptr_t OldWeather       = 0xC81320;  // CWeather::OldWeatherType
		constexpr uintptr_t CameraMatrix     = 0xB6F99C;  // TheCamera.m_mCameraMatrix
		constexpr uintptr_t TargetBlipIndex  = 0xBA6774;  // FrontEndMenuManager.m_nTargetBlipIndex
		constexpr uintptr_t RadarTraces      = 0xBA86F0;  // CRadar::ms_RadarTrace[], 0x28 bytes each

		constexpr uintptr_t ViewMatrix       = 0xB6FA2C;  // RwCamera view matrix (world -> camera)
		constexpr uintptr_t PedPool          = 0xB74490;  // CPools::ms_pPedPool
		constexpr uintptr_t PedPoolSlotSize  = 0x7C4;

		constexpr uintptr_t FnFindGroundZForCoord = 0x569660;  // float __cdecl (float x, float y)
		constexpr uintptr_t FnLoadScene           = 0x40ED80;  // void __cdecl (const CVector *)
		constexpr uintptr_t FnGetBonePosition     = 0x5E4280;  // void __thiscall CPed::(RwV3d &, unsigned bone, bool updateSkin)
	}

	// ---- entity offsets ---------------------------------------------------------------------
	namespace off
	{
		constexpr uintptr_t Matrix        = 0x14;   // CPlaceable::m_matrix
		constexpr uintptr_t RwObject      = 0x18;   // CEntity::m_pRwObject (clump), null until modelled
		constexpr uintptr_t AreaCode      = 0x2F;   // CEntity::m_nAreaCode
		constexpr uintptr_t PhysFlags     = 0x40;   // CPhysical::m_nPhysicalFlags
		constexpr uintptr_t MoveSpeed     = 0x44;   // CPhysical::m_vecMoveSpeed
		constexpr uintptr_t TurnSpeed     = 0x50;   // CPhysical::m_vecTurnSpeed

		constexpr uintptr_t PedPlayerData = 0x480;  // CPed::m_pPlayerData
		constexpr uintptr_t PedHealth     = 0x540;
		constexpr uintptr_t PedMaxHealth  = 0x544;
		constexpr uintptr_t PedArmour     = 0x548;
		constexpr uintptr_t PedRotCurrent = 0x558;
		constexpr uintptr_t PedRotAim     = 0x55C;
		constexpr uintptr_t PedType       = 0x598;  // CPed::m_nPedType
		constexpr uintptr_t PedWeapons    = 0x5A0;  // CWeapon[13], 0x1C bytes each
		constexpr uintptr_t WeaponSize    = 0x1C;
		constexpr uintptr_t WeaponType    = 0x00;
		constexpr uintptr_t WeaponClip    = 0x08;
		constexpr uintptr_t WeaponTotal   = 0x0C;

		constexpr uintptr_t VehHealth     = 0x4C0;

		constexpr uintptr_t WantedChaos   = 0x00;   // CWanted::m_nChaosLevel
		constexpr uintptr_t WantedLevel   = 0x2C;   // CWanted::m_nWantedLevel
	}

	// Proof bits inside the third byte of CPhysical::m_nPhysicalFlags.
	constexpr uint8_t ProofAll = 0x04 /*bullet*/ | 0x08 /*fire*/ | 0x10 /*collision*/ |
	                             0x20 /*melee*/ | 0x40 /*invulnerable*/ | 0x80 /*explosion*/;

	inline void *player_ped()     { return mem<void *>(addr::PlayerPed); }
	inline void *player_vehicle() { return player_ped() ? mem<void *>(addr::PlayerVehicle) : nullptr; }
	inline bool  in_pause_menu()  { return mem<uint8_t>(addr::MenuActive) != 0; }

	inline Matrix *matrix_of(void *entity) { return entity ? field<Matrix *>(entity, off::Matrix) : nullptr; }

	// The thing the player controls: the vehicle if in one, otherwise the ped.
	inline void *controlled_entity()
	{
		void *v = player_vehicle();
		return v ? v : player_ped();
	}

	inline bool get_position(void *entity, Vec3 &out)
	{
		Matrix *m = matrix_of(entity);
		if (!m) return false;
		out = m->pos;
		return true;
	}

	inline Vec3 &move_speed(void *e) { return field<Vec3>(e, off::MoveSpeed); }
	inline Vec3 &turn_speed(void *e) { return field<Vec3>(e, off::TurnSpeed); }

	inline void set_proofs(void *e, bool on)
	{
		uint8_t &b = field<uint8_t>(e, off::PhysFlags + 2);
		b = on ? (b | ProofAll) : (b & ~ProofAll);
	}

	inline float find_ground_z(float x, float y)
	{
		return reinterpret_cast<float(__cdecl *)(float, float)>(addr::FnFindGroundZForCoord)(x, y);
	}

	inline void load_scene(const Vec3 &p)
	{
		reinterpret_cast<void(__cdecl *)(const Vec3 *)>(addr::FnLoadScene)(&p);
	}

	inline Vec3 bone_position(void *ped, unsigned bone)
	{
		Vec3 out = {};
		reinterpret_cast<void(__thiscall *)(void *, Vec3 *, unsigned, bool)>(addr::FnGetBonePosition)(ped, &out, bone, false);
		return out;
	}

	// World -> screen pixels using the camera view matrix (the same projection s0beit used).
	// Returns false for points behind the camera.
	inline bool world_to_screen(const Vec3 &w, float screen_w, float screen_h, float &sx, float &sy)
	{
		const float *m = reinterpret_cast<const float *>(addr::ViewMatrix);
		float x = w.x * m[0] + w.y * m[4] + w.z * m[8]  + m[12];
		float y = w.x * m[1] + w.y * m[5] + w.z * m[9]  + m[13];
		float z = w.x * m[2] + w.y * m[6] + w.z * m[10] + m[14];
		if (z < 1.0f) return false;
		sx = x / z * screen_w;
		sy = y / z * screen_h;
		return true;
	}

	// Iterate the ped pool. fn(ped) is called for every occupied slot.
	template <typename Fn>
	inline void for_each_ped(Fn fn)
	{
		uint8_t *pool = mem<uint8_t *>(addr::PedPool);
		if (!pool) return;
		uint8_t *objects = *reinterpret_cast<uint8_t **>(pool + 0x0);
		uint8_t *flags   = *reinterpret_cast<uint8_t **>(pool + 0x4);
		int size         = *reinterpret_cast<int *>(pool + 0x8);
		if (!objects || !flags) return;
		for (int i = 0; i < size; i++)
			if (!(flags[i] & 0x80))  // high bit = free slot
				fn(static_cast<void *>(objects + i * addr::PedPoolSlotSize));
	}

	inline float length(const Vec3 &v) { return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

	inline Vec3 camera_forward()
	{
		return reinterpret_cast<Matrix *>(addr::CameraMatrix)->forward;
	}
}
