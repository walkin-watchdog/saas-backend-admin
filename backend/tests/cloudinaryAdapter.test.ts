describe('cloudinaryAdapter uploader proxy', () => {
  it('routes uploader methods through externalCall', async () => {
    jest.resetModules();

    const upload = jest.fn().mockResolvedValue({ public_id: 'pid' });

    jest.doMock('cloudinary', () => ({
      v2: { uploader: { upload } },
    }));

    const externalCall = jest.fn((_provider, fn) => fn(undefined));
    jest.doMock('../src/utils/externalAdapter', () => ({ externalCall }));

    const { cloudinary } = await import('../src/utils/cloudinaryAdapter');

    await cloudinary.uploader.upload('file.png');

    expect(externalCall).toHaveBeenCalled();
    const [provider] = externalCall.mock.calls[0];
    expect(provider).toBe('cloudinary');
    expect(upload).toHaveBeenCalledWith('file.png');
  });
});