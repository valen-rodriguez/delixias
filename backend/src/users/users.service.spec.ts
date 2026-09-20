import { vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { UsersRepository } from './users.repository.js';
import {
  DuplicatedDniError,
  AlreadyActiveError,
  InvalidStateError,
  VendedorNotActiveError,
  UserNotFoundError,
} from './users.repository.js';
import type { UserRow, SanitizedProfile } from './entities/user.entity.js';

const baseRow: UserRow = {
  id_usuario: '0f8ef8e0-a2ab-4bed-91c4-4ec89e629484',
  email: 'rodrigeuzvalentin@gmail.com',
  nombre_completo: 'valen',
  telefono: '+5491123456789',
  direccion: null,
  dni: null,
  foto_perfil_url: null,
  estado_vendedor: 'no_solicitado',
  motivo_suspension: null,
  ultima_revision_documental: null,
  ultimo_rol_activo: 'cliente',
};

type MockedRepo = {
  [K in keyof UsersRepository]: ReturnType<typeof vi.fn>;
};

describe('UsersService', () => {
  let repo: MockedRepo;

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      upgradeToSeller: vi.fn(),
      reappealDocumentation: vi.fn(),
      switchRole: vi.fn(),
    };
  });

  function makeService(): UsersService {
    return new UsersService(repo as unknown as UsersRepository);
  }

  it('getProfile devuelve el perfil sanitizado', async () => {
    repo.findById.mockResolvedValue(baseRow);
    const profile = await makeService().getProfile(baseRow.id_usuario);
    expect(profile).toMatchObject({
      id_usuario: baseRow.id_usuario,
      email: baseRow.email,
      estado_vendedor: 'no_solicitado',
      ultimo_rol_activo: 'cliente',
    } satisfies Partial<SanitizedProfile>);
  });

  it('upgradeToSeller con DNI duplicado responde 409 DNI_ALREADY_IN_USE', async () => {
    repo.upgradeToSeller.mockRejectedValue(new DuplicatedDniError('dup'));
    repo.findById.mockResolvedValue(baseRow);
    await expect(
      makeService().upgradeToSeller(baseRow.id_usuario, {
        dni: '30123456',
        direccion: 'Av. Costanera 123',
        foto_perfil_url:
          'https://wyrjgmzsnixpqydvrmrw.supabase.co/storage/v1/object/public/avatares/a.jpg',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'DNI_ALREADY_IN_USE' },
    });
  });

  it('upgradeToSeller con estado distinto responde 409 ALREADY_ACTIVE', async () => {
    repo.upgradeToSeller.mockRejectedValue(new AlreadyActiveError('ya activo'));
    await expect(
      makeService().upgradeToSeller(baseRow.id_usuario, {
        dni: '30123456',
        direccion: 'Av. Costanera 123',
        foto_perfil_url:
          'https://wyrjgmzsnixpqydvrmrw.supabase.co/storage/v1/object/public/avatares/a.jpg',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'ALREADY_ACTIVE' },
    });
  });

  it('reappealDocumentation desde estado inválido responde 409 INVALID_STATE', async () => {
    repo.reappealDocumentation.mockRejectedValue(
      new InvalidStateError('no aplica'),
    );
    await expect(
      makeService().reappealDocumentation(baseRow.id_usuario, 'url'),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'INVALID_STATE' },
    });
  });

  it('switchRole a vendedor sin estado activo responde 403 VENDEDOR_NOT_ACTIVE', async () => {
    repo.switchRole.mockRejectedValue(
      new VendedorNotActiveError('no habilitado'),
    );
    await expect(
      makeService().switchRole(baseRow.id_usuario, 'vendedor'),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: 'VENDEDOR_NOT_ACTIVE' },
    });
  });

  it('usuario inexistente responde NotFoundException', async () => {
    repo.findById.mockRejectedValue(new UserNotFoundError('no existe'));
    await expect(makeService().getProfile('missing')).rejects.toThrow(
      new UserNotFoundError('no existe'),
    );
  });

  it('usuario inexistente en getProfile responde 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(makeService().getProfile('missing')).rejects.toMatchObject({
      status: 404,
      response: { message: 'Usuario no encontrado' },
    });
  });
});
