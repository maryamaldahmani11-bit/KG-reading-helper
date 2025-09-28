import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { lessons } from './data/lessons';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import type { Language, WordAnalysis } from './types';
import { MicIcon, StopIcon, PlayIcon, PauseIcon, NextIcon, PrevIcon, StarIcon, TurtleIcon, RabbitIcon } from './components/icons';

// Assumes process.env.API_KEY is available in the execution environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const translations = {
  en: {
    title: "KG Reading Helper",
    goodTry: "Good try! Let's say it again:",
    greatJob: "Great job! All words read correctly!",
    analyzing: "Listening...",
    record: "Record",
    stop: "Stop",
    replay: "Replay Sentence",
    pause: "Pause",
    resume: "Resume",
    nextLesson: "Next Lesson",
    prevLesson: "Prev Lesson",
    error: "Sorry, I couldn't understand. Please try again!",
  },
  ar: {
    title: "مساعد القراءة",
    goodTry: "محاولة جيدة! لنقلها مرة أخرى:",
    greatJob: "عمل رائع! كل الكلمات قُرأت بشكل صحيح!",
    analyzing: "يستمع...",
    record: "تسجيل",
    stop: "إيقاف",
    replay: "إعادة الجملة",
    pause: "إيقاف مؤقت",
    resume: "استئناف",
    nextLesson: "الدرس التالي",
    prevLesson: "الدرس السابق",
    error: "عذراً، لم أتمكن من الفهم. الرجاء المحاولة مرة أخرى!",
  }
};

const SentenceDisplay: React.FC<{ analysis: WordAnalysis[]; highlightedWordIndex: number }> = ({ analysis, highlightedWordIndex }) => (
  <div className="bg-white p-6 md:p-10 rounded-3xl shadow-lg text-center min-h-[12rem] flex items-center justify-center">
    <p className="text-3xl md:text-5xl font-bold text-gray-800 leading-relaxed tracking-wide">
      {analysis.map((item, index) => (
        <span
          key={index}
          className={`p-1 rounded-md transition-colors duration-200 ${
            !item.isCorrect ? 'text-red-500' : 'text-gray-800'
          } ${
            index === highlightedWordIndex ? 'bg-yellow-300' : 'bg-transparent'
          }`}
        >
          {item.word}{' '}
        </span>
      ))}
    </p>
  </div>
);

const ProgressBar: React.FC<{ accuracy: number }> = ({ accuracy }) => (
  <div className="w-full bg-gray-200 rounded-full h-6 my-4 shadow-inner overflow-hidden">
    <div
      className="bg-gradient-to-r from-green-400 to-blue-500 h-6 rounded-full flex items-center justify-center text-white font-bold text-sm transition-all duration-500 ease-out"
      style={{ width: `${accuracy}%` }}
    >
      {accuracy > 10 && `${Math.round(accuracy)}%`}
    </div>
  </div>
);

const FeedbackDisplay: React.FC<{ text: string, word: string, language: Language, isError?: boolean }> = ({ text, word, language, isError }) => {
    if(!text) return null;
    return (
        <div className={`mt-4 p-4 rounded-2xl text-center text-xl font-semibold transition-opacity duration-300 ${
            isError ? 'bg-red-200 text-red-800' : (word ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800')
        }`}>
            <p dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {text} {word && <span className="font-extrabold text-2xl" dir="ltr">{word}</span>}
            </p>
        </div>
    );
};

const RateControl: React.FC<{ rate: number; onRateChange: (rate: number) => void }> = ({ rate, onRateChange }) => (
    <div className="flex items-center gap-2 p-1 bg-blue-100 rounded-full shadow-inner">
        <TurtleIcon className="w-6 h-6 text-blue-400" />
        <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={rate}
            onChange={(e) => onRateChange(parseFloat(e.target.value))}
            className="w-24 md:w-32 accent-blue-500 cursor-pointer"
            aria-label="Speech rate"
        />
        <RabbitIcon className="w-6 h-6 text-blue-400" />
    </div>
);

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
        };
        reader.onerror = (error) => reject(error);
    });
};


export default function App() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [language, setLanguage] = useState<Language>('en');
  const [analysis, setAnalysis] = useState<WordAnalysis[]>([]);
  const [accuracy, setAccuracy] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackWord, setFeedbackWord] = useState('');
  const [isError, setIsError] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1);
  const [speechRate, setSpeechRate] = useState(0.9);

  const { speak, pause, resume, cancel, isPlaying, isPaused, voices } = useSpeechSynthesis();
  const t = translations[language];

  const currentLesson = lessons[lessonIndex];
  const currentSentence = currentLesson.sentences[sentenceIndex];

  const cancelSpeech = useCallback(() => {
    cancel();
    setHighlightedWordIndex(-1);
  }, [cancel]);

  const handleAnalysis = useCallback(async (audioBlob: Blob) => {
    setIsAnalyzing(true);
    setFeedbackText('');
    setFeedbackWord('');
    setIsError(false);
    setAccuracy(0);
    setAnalysis(currentSentence.split(' ').map(word => ({ word, isCorrect: true })));

    try {
        const audioData = await blobToBase64(audioBlob);

        const prompt = `You are a reading evaluation tool for a kindergarten student. The student has recorded themselves reading a sentence. Analyze the provided audio recording and compare it to the correct sentence text below.

        Correct sentence: "${currentSentence}"

        Your task is to determine which words the student pronounced correctly and which they did not. Provide your analysis in a JSON format that strictly adheres to the provided schema.
        - The 'analysis' array must contain every word from the original sentence in order.
        - 'isCorrect' should be true if the word was pronounced correctly or is a very close approximation for a young child. It should be false for skipped, mumbled, or clearly mispronounced words.
        - 'allCorrect' is true only if every single word is correct.
        - 'firstMistake' should be the first word from the sentence that was marked as incorrect. If all words are correct, this should be an empty string.`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                analysis: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            word: { type: Type.STRING },
                            isCorrect: { type: Type.BOOLEAN },
                        },
                        required: ["word", "isCorrect"],
                    },
                },
                allCorrect: { type: Type.BOOLEAN },
                firstMistake: { type: Type.STRING },
            },
            required: ["analysis", "allCorrect", "firstMistake"],
        };
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'audio/wav', data: audioData } },
                ],
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            },
        });

        const result = JSON.parse(response.text);

        setAnalysis(result.analysis);
        const correctCount = result.analysis.filter((a: WordAnalysis) => a.isCorrect).length;
        const newAccuracy = (correctCount / result.analysis.length) * 100;
        setAccuracy(newAccuracy);

        const langCode = language === 'ar' ? 'ar-SA' : 'en-US';

        if (!result.allCorrect && result.firstMistake) {
            setFeedbackText(t.goodTry);
            setFeedbackWord(result.firstMistake);

            const femaleVoice =
                voices.find(voice => voice.lang === 'en-US' && /female|zira|susan|kathy/i.test(voice.name.toLowerCase())) ||
                voices.find(voice => voice.lang === 'en-US');

            speak([
                { text: t.goodTry, lang: langCode, rate: speechRate },
                { text: result.firstMistake, lang: 'en-US', rate: 0.6, voice: femaleVoice },
                { text: currentSentence, lang: 'en-US', rate: speechRate }
            ]);
        } else {
            setFeedbackText(t.greatJob);
            setFeedbackWord('');
            speak([{ text: t.greatJob, lang: langCode, rate: speechRate }]);
        }

    } catch (error) {
        console.error("Error during analysis:", error);
        setFeedbackText(t.error);
        setIsError(true);
        speak([{ text: t.error, lang: language === 'ar' ? 'ar-SA' : 'en-US', rate: speechRate }]);
    } finally {
        setIsAnalyzing(false);
    }
  }, [currentSentence, language, speak, t.goodTry, t.greatJob, voices, speechRate, t.error]);


  const { isRecording, startRecording, stopRecording } = useAudioRecorder(handleAnalysis);

  useEffect(() => {
    cancelSpeech();
    const words = currentSentence.split(' ').map(word => ({ word, isCorrect: true }));
    setAnalysis(words);
    setAccuracy(0);
    setFeedbackText('');
    setFeedbackWord('');
    setIsError(false);
  }, [lessonIndex, sentenceIndex, currentSentence, cancelSpeech]);

  const handleNavigation = (direction: 'prev' | 'next', type: 'lesson' | 'sentence') => {
    if (type === 'lesson') {
      const newIndex = direction === 'next' ? lessonIndex + 1 : lessonIndex - 1;
      if (newIndex >= 0 && newIndex < lessons.length) {
        setLessonIndex(newIndex);
        setSentenceIndex(0);
      }
    } else {
      const newIndex = direction === 'next' ? sentenceIndex + 1 : sentenceIndex - 1;
      if (newIndex >= 0 && newIndex < currentLesson.sentences.length) {
        setSentenceIndex(newIndex);
      }
    }
  };
  
  const getWordIndexFromCharIndex = (text: string, charIndex: number): number => {
    if (charIndex === 0) return 0;
    return text.substring(0, charIndex).split(' ').length - 1;
  };

  const handleReplayControl = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      speak([
        {
          text: currentSentence,
          lang: 'en-US',
          rate: speechRate,
          onBoundary: (event) => {
            const wordIndex = getWordIndexFromCharIndex(currentSentence, event.charIndex);
            setHighlightedWordIndex(wordIndex);
          },
          onEnd: () => {
            setHighlightedWordIndex(-1);
          },
        },
      ]);
    }
  }, [isPlaying, isPaused, pause, resume, speak, currentSentence, speechRate]);
  
  const handleStartRecording = () => {
    cancelSpeech();
    startRecording();
  };


  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans" style={{ background: 'linear-gradient(to bottom right, #60A5FA, #34D399)' }}>
      <main className="w-full max-w-4xl mx-auto bg-slate-50/70 backdrop-blur-sm rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col gap-6">
        
        <header className="flex justify-between items-center flex-wrap gap-4">
            <h1 className="text-3xl md:text-4xl font-black text-blue-600 flex items-center gap-2">
              <StarIcon className="w-8 h-8 text-yellow-400" /> {t.title}
            </h1>
            <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
                <RateControl rate={speechRate} onRateChange={setSpeechRate} />
                <div className="flex items-center gap-2 p-1 bg-blue-200 rounded-full">
                    <button onClick={() => setLanguage('en')} className={`px-4 py-1 rounded-full font-bold text-sm transition-colors ${language === 'en' ? 'bg-white text-blue-600 shadow' : 'text-blue-500'}`}>English</button>
                    <button onClick={() => setLanguage('ar')} className={`px-4 py-1 rounded-full font-bold text-sm transition-colors ${language === 'ar' ? 'bg-white text-blue-600 shadow' : 'text-blue-500'}`}>العربية</button>
                </div>
            </div>
        </header>

        <div className="flex justify-between items-center bg-blue-100 p-3 rounded-2xl">
           <button onClick={() => handleNavigation('prev', 'lesson')} disabled={lessonIndex === 0} className="px-4 py-2 bg-white rounded-lg shadow font-bold text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition hover:bg-blue-50"><PrevIcon className="w-5 h-5"/> {t.prevLesson}</button>
           <h2 className="text-xl md:text-2xl font-bold text-blue-800 text-center">{currentLesson.title}</h2>
           <button onClick={() => handleNavigation('next', 'lesson')} disabled={lessonIndex === lessons.length - 1} className="px-4 py-2 bg-white rounded-lg shadow font-bold text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition hover:bg-blue-50">{t.nextLesson} <NextIcon className="w-5 h-5"/></button>
        </div>
        
        <SentenceDisplay analysis={analysis} highlightedWordIndex={highlightedWordIndex} />

        <div className="flex justify-center items-center gap-4 text-gray-600 font-semibold">
           <button onClick={() => handleNavigation('prev', 'sentence')} disabled={sentenceIndex === 0}>
              <PrevIcon className="w-12 h-12 p-2 rounded-full bg-white shadow-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed" />
           </button>
           <span>{sentenceIndex + 1} / {currentLesson.sentences.length}</span>
           <button onClick={() => handleNavigation('next', 'sentence')} disabled={sentenceIndex === currentLesson.sentences.length - 1}>
              <NextIcon className="w-12 h-12 p-2 rounded-full bg-white shadow-md hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed" />
           </button>
        </div>

        {accuracy > 0 && <ProgressBar accuracy={accuracy} />}
        
        <FeedbackDisplay text={feedbackText} word={feedbackWord} language={language} isError={isError}/>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">
            <button 
                onClick={handleReplayControl} 
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-blue-500 text-white font-bold text-xl rounded-full shadow-lg hover:bg-blue-600 transition transform hover:scale-105 disabled:bg-gray-400"
            >
                {isPlaying ? <PauseIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7" />}
                <span>
                    {isPlaying ? t.pause : (isPaused ? t.resume : t.replay)}
                </span>
            </button>
            
            <button
                onClick={isRecording ? stopRecording : handleStartRecording}
                className={`w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 font-bold text-xl rounded-full shadow-lg transition transform hover:scale-105 disabled:bg-gray-400 ${
                isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500 text-white'
                }`}
                disabled={isAnalyzing || isPlaying}
            >
                {isRecording ? <StopIcon className="w-7 h-7" /> : <MicIcon className="w-7 h-7" />}
                <span>
                    {isAnalyzing ? t.analyzing : (isRecording ? t.stop : t.record)}
                </span>
            </button>
        </div>

      </main>
    </div>
  );
}
