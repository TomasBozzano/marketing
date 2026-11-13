
import { supabase } from './service/supabase.service.js';

// CONFIGURACIÓN
const BUCKET = 'app-arjun-marketing';
const CARPETA = '327/21';
const DURACION_IMAGEN = 5000;
const ROTACION = 'rotate(90deg)';

let elementosCarrusel = [];
let indiceActual = 0;
let timeoutCarrusel = null;
const animacionesVideo = new WeakMap();

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

            video.autoplay = true;
            video.muted = true;
            video.defaultMuted = true;
            video.controls = false;
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('disablepictureinpicture', '');
            video.preload = 'auto';

            const source = document.createElement('source');
            source.src = archivo.url;
            source.type = archivo.mimeType;

            video.appendChild(source);

            const dibujarFotograma = () => {
                if (video.paused || video.ended) {
                    return;
                }

                if (
                    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    canvas.width > 0 &&
                    canvas.height > 0
                ) {
                    contexto.drawImage(
                        video,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );
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
                cancelAnimationFrame(animacionesVideo.get(video));
            });
            video.addEventListener('loadeddata', () => {
                if (video.paused === false) {
                    dibujarFotograma();
                }
            });

            // Avanzar cuando termine el video
            video.addEventListener('ended', () => {
                siguienteElemento();
            });

            // Si ocurre un error de reproducción, avanzar
            video.addEventListener('error', () => {
                console.error('Error cargando video:', archivo.nombre);
                siguienteElemento();
            });

            video.load();
            video.classList.add('video-source');
            elementoMedia = canvas;
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
            video.pause();
            video.currentTime = 0;
        }
    });

    indiceActual = indice;

    const slideActual = elementosCarrusel[indiceActual];

    slideActual.classList.add('active');

    const video = slideActual.querySelector('video');

    if (video) {
        video.play().catch(error => {
            console.error('Error reproduciendo video:', error);

            // Si el navegador no permite reproducirlo, avanzar
            siguienteElemento();
        });

    } else {
        timeoutCarrusel = setTimeout(() => {
            siguienteElemento();
        }, DURACION_IMAGEN);
    }
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
        return;
    }

    crearCarrusel(archivos);

    mostrarElemento(0);
}

// Ejecutar cuando cargue el DOM
document.addEventListener('DOMContentLoaded', () => {
    inicializarCarrusel();
});
