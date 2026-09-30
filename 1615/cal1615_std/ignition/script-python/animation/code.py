def animate(animation, duration, origin, timing):

	messageType = "updateAnimation"
	
	payload = {
		'animation':animation,
		'duration':duration,
		'origin':origin,
		'timing':timing
	} 
	
	system.perspective.sendMessage(messageType, payload, scope = 'page')