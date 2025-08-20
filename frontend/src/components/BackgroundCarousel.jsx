import { useEffect, useState } from 'react';

// load all images from local asset folder
const imageModules = import.meta.glob('../assets/backgrounds/*.png', { eager: true });
const images = Object.values(imageModules).map((mod) => mod.default);

const BackgroundCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
      {images.map((src, index) => (
        <img
          key={index}
          src={src}
          alt={`background-${index}`}
          className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-black/30 z-20" />
    </div>
  );
};

export default BackgroundCarousel;
