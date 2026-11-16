import { supabase } from './service/supabase.service.js';

const BUCKET = 'public-arjun';
const CARPETA = '327/21';
const DURACION_IMAGEN = 5000;
const ROTACION = 'rotate(90deg)';

let slides = [];
let indiceActual = 0;
let temporizador = null;

function obtenerExtension(nombre) {
    return nombre.split('.').pop()?.toLowerCase() || '';
}

function esVideo(archivo) {
    const mimeType = archivo.metadata?.mimetype || '';
    const extensionesVideo = [
        'mp4',
        'm4v',
        'webm',
        'mov',
        'ogv',
        'ogg',
        'mkv',
        'avi',
        '3gp',
        'ts',
        'm3u8'
    ];

    return mimeType.startsWith('video/') ||
        extensionesVideo.includes(obtenerExtension(archivo.name));
}

function esImagen(archivo) {
    const mimeType = archivo.metadata?.mimetype || '';
    const extensionesImagen = [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'avif',
        'bmp'
    ];

    return mimeType.startsWith('image/') ||
        extensionesImagen.includes(obtenerExtension(archivo.name));
}

async function obtenerArchivos() {
    const { data, error } = await supabase
        .storage
        .from(BUCKET)
        .list(CARPETA, {
            limit: 100,
            offset: 0,
            sortBy: {
                column: 'name',
                order: 'asc'
            }
        });

    if (error) {
        throw error;
    }

    return data
        .filter(archivo => esVideo(archivo) || esImagen(archivo))
        .map(archivo => {
            const { data: urlData } = supabase
                .storage
                .from(BUCKET)
                .getPublicUrl(`${CARPETA}/${archivo.name}`);

            return {
                nombre: archivo.name,
                url: urlData.publicUrl,
                tipo: esVideo(archivo) ? 'VIDEO' : 'IMAGEN'
            };
        });
}

function crearMedia(archivo) {
    if (archivo.tipo === 'VIDEO') {
        const video = document.createElement('video');

        video.addEventListener('loadstart', () =>
            diagnosticoVideo('LOADSTART', video));

        video.addEventListener('loadedmetadata', () =>
            diagnosticoVideo('LOADEDMETADATA', video));

        video.addEventListener('loadeddata', () =>
            diagnosticoVideo('LOADEDDATA', video));

        video.addEventListener('canplay', () =>
            diagnosticoVideo('CANPLAY', video));

        video.addEventListener('playing', () =>
            diagnosticoVideo('PLAYING', video));

        video.addEventListener('waiting', () =>
            diagnosticoVideo('WAITING', video));

        video.addEventListener('stalled', () =>
            diagnosticoVideo('STALLED', video));

        video.addEventListener('error', () =>
            diagnosticoVideo('ERROR', video));

        video.src = archivo.url;
        video.autoplay = false;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.controls = true;
        video.preload = 'metadata';

        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');

        video.addEventListener('ended', siguienteSlide);

        video.addEventListener('error', () => {
            console.error('Error reproduciendo:', archivo.nombre, video.error);
            siguienteSlide();
        });

        return video;
    }

    const imagen = document.createElement('img');

    imagen.src = archivo.url;
    imagen.alt = archivo.nombre;
    imagen.loading = 'eager';

    return imagen;
}

function crearCarrusel(archivos) {
    const contenedor = document.getElementById('form-carrusel');

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '';

    archivos.forEach((archivo, indice) => {
        const slide = document.createElement('div');
        const media = crearMedia(archivo);

        slide.className = 'fade-carousel';
        slide.dataset.indice = indice;
        slide.dataset.tipo = archivo.tipo;

        media.classList.add('fade-image');
        media.style.transform = `translate(-50%, -50%) ${ROTACION}`;

        slide.appendChild(media);
        contenedor.appendChild(slide);
    });

    slides = Array.from(
        contenedor.querySelectorAll('.fade-carousel')
    );
}

function mostrarSlide(indice) {
    if (slides.length === 0) {
        return;
    }

    clearTimeout(temporizador);

    slides.forEach(slide => {
        slide.classList.remove('active');

        const video = slide.querySelector('video');

        if (video) {
            video.pause();
            video.currentTime = 0;
        }
    });

    indiceActual = indice;

    const slideActual = slides[indiceActual];
    const mediaActual = slideActual.querySelector('video, img');

    slideActual.classList.add('active');

    if (mediaActual.tagName === 'VIDEO') {

        mediaActual.play()
            .then(() => {
                diagnosticoVideo('PLAY PROMISE RESUELTA', mediaActual);
            })
            .catch(error => {
                diagnosticoVideo(
                    `PLAY RECHAZADO: ${error.name} - ${error.message}`,
                    mediaActual
                );
            });

        return;
    }

    temporizador = setTimeout(siguienteSlide, DURACION_IMAGEN);
}

function diagnosticoVideo(mensaje, video = null) {
    const panel = document.getElementById('diagnostico-video');
    if (!panel) return;

    const datos = video ? `
                URL: ${video.currentSrc || video.src}
                readyState: ${video.readyState}
                networkState: ${video.networkState}
                error: ${video.error?.code || 'ninguno'}
                errorMessage: ${video.error?.message || 'sin mensaje'}
                paused: ${video.paused}
                currentTime: ${video.currentTime}
                ` : '';

    panel.textContent =
        `${new Date().toLocaleTimeString()} - ${mensaje}\n${datos}`;
}

function siguienteSlide() {
    if (slides.length === 0) {
        return;
    }

    mostrarSlide((indiceActual + 1) % slides.length);
}

async function iniciarCarrusel() {
    try {
        const archivos = await obtenerArchivos();

        if (archivos.length === 0) {
            return;
        }

        crearCarrusel(archivos);
        mostrarSlide(0);
    } catch (error) {
        console.error('No se pudo iniciar el carrusel:', error);
    }
}

document.addEventListener('DOMContentLoaded', iniciarCarrusel);
