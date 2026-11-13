
import { supabase } from './service/supabase.service.js';

// CONFIGURACIÓN
const BUCKET = 'public-arjun';
const CARPETA = '327/21';
const DURACION_IMAGEN = 5000;
const ROTACION = 'rotate(90deg)';
const EXTENSIONES_VIDEO = new Set([
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
]);
const EXTENSIONES_IMAGEN = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'avif',
    'bmp'
]);

let elementosCarrusel = [];
let indiceActual = 0;
let timeoutCarrusel = null;
let carruselIniciado = false;
let ultimaInteraccionInicio = 0;
const reintentosVideo = new WeakMap();
const temporizadoresFinVideo = new WeakMap();

function obtenerExtension(nombre) {
    return nombre
        .split('.')
        .pop()
        ?.toLowerCase() || '';
}

function obtenerTipoArchivo(archivo) {
    const mimeType = archivo.metadata?.mimetype?.toLowerCase() || '';
    const extension = obtenerExtension(archivo.name);

    if (mimeType.startsWith('video/') || EXTENSIONES_VIDEO.has(extension)) {
        return 'VIDEO';
    }

    if (mimeType.startsWith('image/') || EXTENSIONES_IMAGEN.has(extension)) {
        return 'IMAGEN';
    }

    return null;
}

function obtenerMimeType(archivo) {
    const mimeType = archivo.metadata?.mimetype || '';

    if (mimeType) {
        return mimeType;
    }

    const mimeTypesPorExtension = {
        mp4: 'video/mp4',
        m4v: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        ogv: 'video/ogg',
        ogg: 'video/ogg',
        mkv: 'video/x-matroska',
        avi: 'video/x-msvideo',
        '3gp': 'video/3gpp',
        ts: 'video/mp2t',
        m3u8: 'application/vnd.apple.mpegurl'
    };

    return mimeTypesPorExtension[obtenerExtension(archivo.name)] || '';
}

// Obtener archivos de Supabase
async function obtenerArchivos() {
    try {
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

        // Filtrar únicamente imágenes y videos
        const archivos = data.filter(archivo => {
            return obtenerTipoArchivo(archivo) !== null;
        });

        return archivos.map(archivo => {
            const { data: urlData } = supabase
                .storage
                .from(BUCKET)
                .getPublicUrl(`${CARPETA}/${archivo.name}`);
            const mimeType = obtenerMimeType(archivo);

            return {
                nombre: archivo.name,
                tipo: obtenerTipoArchivo(archivo),
                mimeType,
                url: urlData.publicUrl
            };
        });

    } catch (error) {
        console.error('Error obteniendo archivos de Supabase:', error);
        return [];
    }
}

// Crear elementos HTML del carrusel
function crearCarrusel(archivos) {
    const contenedor = document.getElementById('form-carrusel');

    if (!contenedor) {
        console.error('No se encontró el contenedor #form-carrusel');
        return;
    }

    contenedor.innerHTML = '';

    archivos.forEach((archivo, indice) => {
        const slide = document.createElement('div');

        slide.classList.add('fade-carousel');

        slide.dataset.indice = indice;
        slide.dataset.tipo = archivo.tipo;

        let elementoMedia;

        if (archivo.tipo === 'VIDEO') {
            const video = document.createElement('video');

            // El autoplay se activa únicamente después de pulsar el botón de
            // inicio. Así el navegador de la TV recibe una interacción válida.
            video.autoplay = false;
            video.muted = true;
            video.defaultMuted = true;
            video.volume = 0;
            video.controls = false;
            video.playsInline = true;
            video.preload = 'metadata';
            video.disablePictureInPicture = true;
            video.disableRemotePlayback = true;
            video.tabIndex = -1;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('disablepictureinpicture', '');
            video.setAttribute('disableremoteplayback', '');
            video.setAttribute(
                'controlslist',
                'nodownload nofullscreen noremoteplayback noplaybackrate'
            );
            video.setAttribute('aria-hidden', 'true');
            video.src = archivo.url;
            video.addEventListener('playing', () => {
                programarFinVideo(video, slide);
            });
            video.addEventListener('pause', () => {
                limpiarTemporizadorFinVideo(video);
            });
            video.addEventListener('canplay', () => {
                if (carruselIniciado && slide.classList.contains('active')) {
                    intentarReproducirVideo(video);
                }
            });

            // Avanzar cuando termine el video
            video.addEventListener('ended', () => {
                avanzarAlFinalDelVideo(video, slide);
            });

            // Si ocurre un error de reproducción, avanzar
            video.addEventListener('error', () => {
                console.error('Error cargando video:', archivo.nombre);

                const botonInicio = document.getElementById('boton-inicio');

                if (slide.classList.contains('active')) {
                    if (botonInicio) {
                        botonInicio.hidden = false;
                        botonInicio.focus({ preventScroll: true });
                    }

                    siguienteElemento();
                }
            });

            video.load();
            elementoMedia = video;
            elementoMedia.dataset.videoSource = archivo.nombre;

        } else {
            elementoMedia = document.createElement('img');

            elementoMedia.src = archivo.url;
            elementoMedia.alt = 'Imagen del carrusel';
        }

        elementoMedia.classList.add('fade-image');

        elementoMedia.style.transform =
            `translate(-50%, -50%) ${ROTACION}`;

        slide.appendChild(elementoMedia);
        contenedor.appendChild(slide);
    });

    elementosCarrusel = Array.from(
        contenedor.querySelectorAll('.fade-carousel')
    );
}

function limpiarTemporizadorFinVideo(video) {
    const temporizador = temporizadoresFinVideo.get(video);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresFinVideo.delete(video);
    }
}

// Algunos navegadores de Smart TV pueden emitir `ended` antes de actualizar
// completamente el tiempo actual. Se valida la duración real antes de cambiar
// de slide y se deja un temporizador de respaldo para completar el video.
function programarFinVideo(video, slide) {
    limpiarTemporizadorFinVideo(video);

    const duracion = video.duration;

    if (!Number.isFinite(duracion) || duracion <= 0) {
        return;
    }

    const segundosRestantes = Math.max(
        0.25,
        duracion - video.currentTime + 0.15
    );

    const temporizador = setTimeout(() => {
        avanzarAlFinalDelVideo(video, slide);
    }, segundosRestantes * 1000);

    temporizadoresFinVideo.set(video, temporizador);
}

function avanzarAlFinalDelVideo(video, slide) {
    if (!carruselIniciado || !slide.classList.contains('active')) {
        return;
    }

    const duracion = video.duration;
    const segundosRestantes = duracion - video.currentTime;

    // No se avanza si el evento llegó antes de que el video termine.
    if (Number.isFinite(duracion) && segundosRestantes > 0.25) {
        programarFinVideo(video, slide);
        return;
    }

    limpiarTemporizadorFinVideo(video);
    siguienteElemento();
}

// Reproducir siempre en silencio. Los reintentos son automáticos para evitar
// depender de una pulsación en la pantalla de la TV.
function intentarReproducirVideo(video) {
    const videoActual = elementosCarrusel[indiceActual]?.querySelector('video');

    if (!carruselIniciado || videoActual !== video || !video.paused || video.ended) {
        return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = true;
    video.setAttribute('autoplay', '');

    const reproduccion = video.play();

    if (!reproduccion || typeof reproduccion.catch !== 'function') {
        return;
    }

    reproduccion.catch(error => {
        if (videoActual !== elementosCarrusel[indiceActual]?.querySelector('video')) {
            return;
        }

        // AbortError aparece normalmente al cambiar de slide y no requiere
        // reintento. NotAllowedError se reintenta sin mostrar controles.
        if (error.name !== 'AbortError') {
            const botonInicio = document.getElementById('boton-inicio');

            if (botonInicio && error.name === 'NotAllowedError') {
                // Browser puede exigir el gesto cuando entra el primer video,
                // especialmente si el carrusel comenzó mostrando una imagen.
                botonInicio.hidden = false;
                botonInicio.focus({ preventScroll: true });
            }

            if (error.name !== 'NotAllowedError') {
                console.error('Error reproduciendo video:', error);
            }

            const reintentoAnterior = reintentosVideo.get(video);

            if (reintentoAnterior) {
                clearTimeout(reintentoAnterior);
            }

            const reintento = setTimeout(() => {
                reintentosVideo.delete(video);
                intentarReproducirVideo(video);
            }, 1000);

            reintentosVideo.set(video, reintento);
        }
    });
}

// Mostrar elemento actual
function mostrarElemento(indice) {
    if (elementosCarrusel.length === 0) {
        return;
    }

    clearTimeout(timeoutCarrusel);

    // Ocultar todos los elementos y detener videos
    elementosCarrusel.forEach(slide => {
        slide.classList.remove('active');

        const video = slide.querySelector('video');

        if (video) {
            limpiarTemporizadorFinVideo(video);

            const reintento = reintentosVideo.get(video);

            if (reintento) {
                clearTimeout(reintento);
                reintentosVideo.delete(video);
            }

            video.pause();
            video.currentTime = 0;
            video.autoplay = false;
            video.removeAttribute('autoplay');
        }
    });

    indiceActual = indice;

    const slideActual = elementosCarrusel[indiceActual];

    slideActual.classList.add('active');

    if (!carruselIniciado) {
        return;
    }

    const video = slideActual.querySelector('video');

    if (video) {
        intentarReproducirVideo(video);

    } else if (slideActual.dataset.tipo !== 'VIDEO') {
        timeoutCarrusel = setTimeout(() => {
            siguienteElemento();
        }, DURACION_IMAGEN);
    }
}

// La primera pulsación desbloquea el autoplay del navegador de la TV. Luego
// el carrusel avanza por todos los elementos y vuelve al primero sin más
// interacción.
function iniciarCarrusel() {
    const botonInicio = document.getElementById('boton-inicio');
    const ahora = Date.now();

    // Un mando puede generar keydown + click para la misma pulsación.
    // Evitamos reiniciar el video dos veces por una única orden.
    if (ahora - ultimaInteraccionInicio < 400) {
        return;
    }

    ultimaInteraccionInicio = ahora;

    if (
        (carruselIniciado && botonInicio?.hidden !== false) ||
        elementosCarrusel.length === 0
    ) {
        return;
    }

    carruselIniciado = true;

    const videoActual = elementosCarrusel[indiceActual]?.querySelector('video');

    if (videoActual) {
        // Ocultar el botón solamente cuando el navegador confirma que el video
        // comenzó. Si play() es rechazado, queda disponible para reintentar.
        videoActual.addEventListener(
            'playing',
            () => {
                if (botonInicio) {
                    botonInicio.hidden = true;
                }
            },
            { once: true }
        );
    } else if (botonInicio) {
        // Las imágenes no necesitan desbloqueo de autoplay.
        botonInicio.hidden = true;
    }

    mostrarElemento(indiceActual);
}

function manejarInteraccionInicio(evento) {
    if (evento.type === 'keydown') {
        const teclasInicio = new Set([
            'Enter',
            ' ',
            'Select',
            'Accept',
            'OK'
        ]);

        const esDpadCentral = [13, 23, 66].includes(evento.keyCode);

        if (!teclasInicio.has(evento.key) && !esDpadCentral) {
            return;
        }
    }

    // El gesto se procesa en pointerdown/keydown para que Browser lo asocie
    // directamente con video.play(), incluso usando el control remoto.
    evento.preventDefault();
    evento.stopPropagation();
    iniciarCarrusel();
}

// Pasar al siguiente elemento
function siguienteElemento() {
    if (elementosCarrusel.length === 0) {
        return;
    }

    const siguienteIndice =
        (indiceActual + 1) % elementosCarrusel.length;

    mostrarElemento(siguienteIndice);
}

// Inicializar carrusel
async function inicializarCarrusel() {
    const archivos = await obtenerArchivos();

    if (archivos.length === 0) {
        console.warn('No hay archivos disponibles para el carrusel.');

        const botonInicio = document.getElementById('boton-inicio');

        if (botonInicio) {
            botonInicio.hidden = true;
        }

        return;
    }

    crearCarrusel(archivos);

    // Mostrar el primer elemento, pero esperar el toque inicial para empezar
    // a reproducir medios o avanzar automáticamente.
    mostrarElemento(0);

    const botonInicio = document.getElementById('boton-inicio');
    botonInicio?.focus({ preventScroll: true });
}

// Ejecutar cuando cargue el DOM
document.addEventListener('DOMContentLoaded', () => {
    const botonInicio = document.getElementById('boton-inicio');

    botonInicio?.addEventListener('pointerdown', manejarInteraccionInicio);
    botonInicio?.addEventListener('keydown', manejarInteraccionInicio);
    botonInicio?.addEventListener('click', iniciarCarrusel);
    inicializarCarrusel();
});
