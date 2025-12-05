// Simple emotion/sentiment analyzer for text
// This is a basic implementation - for production, consider using a more sophisticated NLP library

export class EmotionAnalyzer {
  constructor() {
    // Emotion keywords with weights
    this.emotionKeywords = {
      happy: {
        keywords: [
          'happy', 'joy', 'excited', 'great', 'awesome', 'wonderful', 'amazing', 
          'fantastic', 'excellent', 'love', 'like', 'good', 'best', 'perfect',
          'smile', 'laugh', 'fun', 'enjoy', 'pleased', 'glad', 'cheerful',
          'delighted', 'thrilled', 'elated', 'overjoyed', 'blissful'
        ],
        weight: 1.0
      },
      sad: {
        keywords: [
          'sad', 'cry', 'tears', 'depressed', 'down', 'upset', 'hurt', 'pain',
          'sorry', 'regret', 'disappointed', 'heartbroken', 'miserable', 'gloomy',
          'melancholy', 'grief', 'sorrow', 'despair', 'lonely', 'blue'
        ],
        weight: 1.0
      },
      angry: {
        keywords: [
          'angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'irritated',
          'frustrated', 'pissed', 'outraged', 'livid', 'enraged', 'irate',
          'disgusted', 'fed up', 'bothered', 'aggravated', 'incensed'
        ],
        weight: 1.2
      },
      surprised: {
        keywords: [
          'wow', 'amazing', 'incredible', 'unbelievable', 'shocking', 'surprised',
          'astonished', 'stunned', 'blown away', 'mind-blowing', 'unexpected',
          'sudden', 'startled', 'bewildered', 'flabbergasted'
        ],
        weight: 0.8
      },
      neutral: {
        keywords: [
          'okay', 'fine', 'alright', 'normal', 'regular', 'usual', 'standard',
          'average', 'typical', 'ordinary', 'common', 'plain', 'simple'
        ],
        weight: 0.5
      }
    };

    // Intensity modifiers
    this.intensityModifiers = {
      very: 1.5,
      really: 1.4,
      extremely: 1.8,
      incredibly: 1.6,
      absolutely: 1.7,
      totally: 1.3,
      completely: 1.4,
      quite: 1.2,
      rather: 1.1,
      somewhat: 0.8,
      slightly: 0.6,
      a_bit: 0.7,
      kind_of: 0.7,
      sort_of: 0.7
    };

    // Negation words that flip sentiment
    this.negationWords = [
      'not', 'no', 'never', 'none', 'nothing', 'nobody', 'nowhere',
      'neither', 'nor', 'barely', 'hardly', 'scarcely', 'seldom',
      'without', 'lack', 'absent', 'missing'
    ];
  }

  analyzeEmotion(text) {
    if (!text || typeof text !== 'string') {
      return { emotion: 'neutral', confidence: 0, intensity: 0 };
    }

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    const emotionScores = {};
    let totalMatches = 0;

    // Initialize emotion scores
    Object.keys(this.emotionKeywords).forEach(emotion => {
      emotionScores[emotion] = 0;
    });

    // Analyze each word with context
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prevWord = i > 0 ? words[i - 1] : null;
      const nextWord = i < words.length - 1 ? words[i + 1] : null;

      // Check for emotion keywords
      Object.keys(this.emotionKeywords).forEach(emotion => {
        const emotionData = this.emotionKeywords[emotion];
        
        if (emotionData.keywords.includes(word)) {
          let score = emotionData.weight;
          let isNegated = false;

          // Check for intensity modifiers
          if (prevWord && this.intensityModifiers[prevWord]) {
            score *= this.intensityModifiers[prevWord];
          }
          if (nextWord && this.intensityModifiers[nextWord]) {
            score *= this.intensityModifiers[nextWord];
          }

          // Check for negation in previous 3 words
          for (let j = Math.max(0, i - 3); j < i; j++) {
            if (this.negationWords.includes(words[j])) {
              isNegated = true;
              break;
            }
          }

          if (isNegated) {
            // Flip emotion for negation
            if (emotion === 'happy') {
              emotionScores['sad'] += score * 0.8;
            } else if (emotion === 'sad') {
              emotionScores['happy'] += score * 0.6;
            } else if (emotion === 'angry') {
              emotionScores['neutral'] += score * 0.5;
            } else {
              emotionScores['neutral'] += score * 0.3;
            }
          } else {
            emotionScores[emotion] += score;
          }

          totalMatches++;
        }
      });
    }

    // Find dominant emotion
    let dominantEmotion = 'neutral';
    let maxScore = 0;
    let secondMaxScore = 0;

    Object.keys(emotionScores).forEach(emotion => {
      if (emotionScores[emotion] > maxScore) {
        secondMaxScore = maxScore;
        maxScore = emotionScores[emotion];
        dominantEmotion = emotion;
      } else if (emotionScores[emotion] > secondMaxScore) {
        secondMaxScore = emotionScores[emotion];
      }
    });

    // Calculate confidence and intensity
    const confidence = totalMatches > 0 ? Math.min(maxScore / totalMatches, 1.0) : 0;
    const intensity = Math.min(maxScore, 1.0);
    
    // If confidence is too low or scores are too close, default to neutral
    if (confidence < 0.3 || (maxScore - secondMaxScore) < 0.2) {
      dominantEmotion = 'neutral';
    }

    return {
      emotion: dominantEmotion,
      confidence: confidence,
      intensity: intensity,
      scores: emotionScores,
      debug: {
        words: words.length,
        matches: totalMatches,
        maxScore,
        secondMaxScore
      }
    };
  }

  // Analyze conversation context for more accurate emotion detection
  analyzeConversationEmotion(messages) {
    if (!messages || messages.length === 0) {
      return { emotion: 'neutral', confidence: 0, intensity: 0 };
    }

    // Analyze recent messages with decay
    const recentMessages = messages.slice(-6); // Last 6 messages
    let combinedText = '';
    let weightedScores = {};

    Object.keys(this.emotionKeywords).forEach(emotion => {
      weightedScores[emotion] = 0;
    });

    recentMessages.forEach((message, index) => {
      if (message.content) {
        const weight = Math.pow(0.8, recentMessages.length - 1 - index); // More recent = higher weight
        const analysis = this.analyzeEmotion(message.content);
        
        Object.keys(analysis.scores).forEach(emotion => {
          weightedScores[emotion] += analysis.scores[emotion] * weight;
        });

        combinedText += message.content + ' ';
      }
    });

    // Find dominant emotion from weighted scores
    let dominantEmotion = 'neutral';
    let maxScore = 0;

    Object.keys(weightedScores).forEach(emotion => {
      if (weightedScores[emotion] > maxScore) {
        maxScore = weightedScores[emotion];
        dominantEmotion = emotion;
      }
    });

    const intensity = Math.min(maxScore, 1.0);
    const confidence = Math.min(maxScore / recentMessages.length, 1.0);

    return {
      emotion: dominantEmotion,
      confidence: confidence,
      intensity: intensity,
      conversationLength: messages.length,
      analyzedMessages: recentMessages.length
    };
  }
}
