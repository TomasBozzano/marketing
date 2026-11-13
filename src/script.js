
import { supabase } from './service/supabase.service.js';

// CONFIGURACIÓN
const BUCKET = 'public-arjun';
const CARPETA = '327/21';
const DURACION_IMAGEN = 5000;
const ROTACION = 'rotate(90deg)';

let elementosCarrusel = [];
let indiceActual = 0;
let timeoutCarrusel = null;
let carruselIniciado = false;
const animacionesVideo = new WeakMap();
const reintentosVideo = new WeakMap();

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
            const mimeType = archivo.metadata?.mimetype || '';

            return mimeType.startsWith('image/') ||
                   mimeType.startsWith('video/');
        });

        return archivos.map(archivo => {
            const { data: urlData } = supabase
                .storage
                .from(BUCKET)
                .getPublicUrl(`${CARPETA}/${archivo.name}`);
            const mimeType = archivo.metadata?.mimetype || '';

            return {
                nombre: archivo.name,
                tipo: mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGEN',
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

        let elementoMedia;

        if (archivo.tipo === 'VIDEO') {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const contexto = canvas.getContext('2d');

            if (!contexto) {
                console.error('No se pudo crear el canvas para:', archivo.nombre);
                return;
            }

            // El video nunca se muestra directamente: solo se usa como fuente
            // para el canvas. Así el navegador de la TV no puede abrir sus
            // controles ni mostrar el popup nativo de reproducción.
            // El autoplay se activa únicamente después de pulsar el botón de
            // inicio. Así el navegador de la TV recibe una interacción válida.
            video.autoplay = false;
            video.muted = true;
            video.defaultMuted = true;
            video.volume = 0;
            video.controls = false;
            video.playsInline = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';
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

            const dibujarFotograma = () => {
                if (video.paused || video.ended) {
                    return;
                }

                if (
                    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    canvas.width > 0 &&
                    canvas.height > 0
                ) {
                    try {
                        contexto.drawImage(
                            video,
                            0,
                            0,
                            canvas.width,
                            canvas.height
                        );
                    } catch (error) {
                        console.error(
                            'No se pudo dibujar el video en el canvas:',
                            archivo.nombre,
                            error
                        );
                        detenerAnimacionVideo(video);
                        return;
                    }
                }

                animacionesVideo.set(
                    video,
                    requestAnimationFrame(dibujarFotograma)
                );
            };

            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            });

            video.addEventListener('playing', dibujarFotograma);
            video.addEventListener('pause', () => {
                detenerAnimacionVideo(video);
            });
            video.addEventListener('loadeddata', () => {
                if (!video.paused && !video.ended) {
                    dibujarFotograma();
                }
            });
            video.addEventListener('canplay', () => {
                if (carruselIniciado && slide.classList.contains('active')) {
                    intentarReproducirVideo(video);
                }
            });

            // Avanzar cuando termine el video
            video.addEventListener('ended', () => {
                if (slide.classList.contains('active')) {
                    siguienteElemento();
                }
            });

            // Si ocurre un error de reproducción, avanzar
            video.addEventListener('error', () => {
                console.error('Error cargando video:', archivo.nombre);
                if (slide.classList.contains('active')) {
                    siguienteElemento();
                }
            });

            video.load();
            elementoMedia = canvas;
            elementoMedia.dataset.videoSource = archivo.nombre;
            elementoMedia.setAttribute('aria-hidden', 'true');

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

// Cancelar el repintado del video cuando deja de ser visible.
function detenerAnimacionVideo(video) {
    const frame = animacionesVideo.get(video);

    if (frame) {
        cancelAnimationFrame(frame);
        animacionesVideo.delete(video);
    }
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
            detenerAnimacionVideo(video);

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

    } else {
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
}

// Ejecutar cuando cargue el DOM
document.addEventListener('DOMContentLoaded', () => {
    const botonInicio = document.getElementById('boton-inicio');

    botonInicio?.addEventListener('click', iniciarCarrusel);
    inicializarCarrusel();
});
